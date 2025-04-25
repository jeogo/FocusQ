import { Server } from 'socket.io';
import http from 'http';
import express from 'express';
import * as db from '../db';

let io: Server | null = null;
let httpServer: http.Server | null = null;

// الأحداث التي يمكن للعملاء الاشتراك بها
const EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  QUEUE_STATE: 'queueState',
  TICKET_ADDED: 'ticketAdded',
  TICKET_CALLED: 'ticketCalled',
  TICKET_COMPLETED: 'ticketCompleted',
  COUNTER_STATUS_CHANGED: 'counterStatusChanged',
  COUNTER_ADDED: 'counterAdded',
  ERROR: 'error',
  PING: 'ping',
  PONG: 'pong'
};

export function startSocketServer(port = 4000) {
  if (io) {
    console.log('[Server] Socket.IO server already running');
    return io; // Return existing server if already running
  }

  // Create Express app
  const app = express();
  // Optional: Add REST endpoints here, e.g. health check
  // app.get('/health', (req, res) => res.send('OK'));

  console.log(`[Server] Starting Express+Socket.IO server on port ${port}...`);
  httpServer = http.createServer(app);
  io = new Server(httpServer, {
    cors: {
      origin: '*', // Allow connections from any source
      methods: ['GET', 'POST']
    },
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  // Handle client connections
  io.on(EVENTS.CONNECT, (socket) => {
    console.log('[Server] Client connected:', socket.id);

    // Send initial queue state to the newly connected client
    socket.emit(EVENTS.QUEUE_STATE, db.getQueueState());

    // Handle heartbeat requests (ping-pong)
    socket.on(EVENTS.PING, (callback) => {
      // Log less frequently to avoid console spam
      if (Math.random() < 0.1) {
        console.log(`[Server] Heartbeat received from client ${socket.id}`);
      }
      // Respond with pong
      socket.emit(EVENTS.PONG, { timestamp: Date.now() });
      // Execute callback for acknowledgment
      if (typeof callback === 'function') {
        callback({ timestamp: Date.now() });
      }
    });

    // Handle network info requests
    socket.on('get-network-info', (cb) => {
      console.log(`[Server] Network info request from ${socket.id}`);
      // Try to get the local IP address from the OS
      let localIp = 'localhost';
      try {
        const nets = require('os').networkInterfaces();
        for (const name of Object.keys(nets)) {
          for (const net of nets[name] || []) {
            if (net.family === 'IPv4' && !net.internal) {
              localIp = net.address;
              break;
            }
          }
        }
      } catch (e) {
        console.error('[Server] Error getting local IP:', e);
      }
      console.log(`[Server] Sending network info: IP=${localIp}, port=${port}`);
      cb({
        localIp,
        isConnected: true,
        serverPort: port
      });
    });

    // الاستماع لإضافة تذكرة جديدة
    socket.on('addTicket', async (data, callback) => {
      try {
        // إضافة التذكرة إلى قاعدة البيانات
        const ticket = await db.addTicket(data.serviceType, data.customerName || '');

        // إرسال التذكرة المضافة لجميع العملاء المتصلين
        io!.emit(EVENTS.TICKET_ADDED, ticket);

        // إرسال حالة الطابور المحدثة لجميع العملاء
        io!.emit(EVENTS.QUEUE_STATE, db.getQueueState());

        // إرسال رد بالنجاح للعميل المرسل
        if (callback) callback({ success: true, ticket });
      } catch (err: any) {
        console.error('Error adding ticket:', err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // استدعاء العميل التالي
    socket.on('callNextCustomer', async (counterId, callback) => {
      try {
        // العثور على التذكرة التالية في الانتظار
        const tickets = db.getQueueState().tickets;
        const nextTicket = tickets.find(ticket => ticket.status === 'waiting');

        if (!nextTicket) {
          if (callback) callback({ success: false, error: 'No waiting tickets' });
          return;
        }

        // تحديث حالة التذكرة إلى "serving" وتعيين رقم المكتب
        await db.updateTicketStatus(nextTicket.id, 'serving');
        await db.updateTicketCounter(nextTicket.id, counterId);

        // تحديث حالة المكتب إلى مشغول وتعيين التذكرة الحالية
        await db.updateCounter(counterId, 'active', true, nextTicket.id);

        // الحصول على التذكرة المحدثة من قاعدة البيانات
        const updatedTicket = db.getTicketById(nextTicket.id);

        // إرسال حدث استدعاء تذكرة لجميع العملاء
        io!.emit(EVENTS.TICKET_CALLED, {
          ticket: updatedTicket,
          counterId
        });

        // إرسال حالة الطابور المحدثة
        io!.emit(EVENTS.QUEUE_STATE, db.getQueueState());

        // إرسال رد بالنجاح مع التذكرة
        if (callback) callback({ success: true, ticket: updatedTicket });
      } catch (err: any) {
        console.error('Error calling next customer:', err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // إنهاء خدمة العميل الحالي
    socket.on('completeService', async (counterId, callback) => {
      try {
        // البحث عن المكتب
        const counter = db.getCounterById(counterId);

        if (!counter || counter.currentTicket === null) {
          if (callback) callback({ success: false, error: 'No active ticket for this counter' });
          return;
        }

        // تحديث حالة التذكرة إلى "complete"
        await db.updateTicketStatus(counter.currentTicket, 'complete');

        // تحديث حالة المكتب إلى غير مشغول وإزالة التذكرة الحالية
        await db.updateCounter(counterId, counter.status, false, null);

        // إرسال حدث إتمام الخدمة لجميع العملاء
        io!.emit(EVENTS.TICKET_COMPLETED, {
          ticketId: counter.currentTicket,
          counterId
        });

        // إرسال حالة الطابور المحدثة
        io!.emit(EVENTS.QUEUE_STATE, db.getQueueState());

        if (callback) callback({ success: true });
      } catch (err: any) {
        console.error('Error completing service:', err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // تحديث حالة المكتب (نشط، مغلق، استراحة)
    socket.on('updateCounterStatus', async (data, callback) => {
      try {
        const { counterId, status } = data;

        if (!counterId || !status) {
          if (callback) callback({ success: false, error: 'Missing counterId or status' });
          return;
        }

        const counter = db.getCounterById(counterId);

        if (!counter) {
          if (callback) callback({ success: false, error: 'Counter not found' });
          return;
        }

        // تحديث حالة المكتب
        await db.updateCounter(counterId, status, counter.busy, counter.currentTicket);

        // إرسال حدث تغيير حالة المكتب
        io!.emit(EVENTS.COUNTER_STATUS_CHANGED, {
          counterId,
          status,
          busy: counter.busy
        });

        // إرسال حالة الطابور المحدثة
        io!.emit(EVENTS.QUEUE_STATE, db.getQueueState());

        if (callback) callback({ success: true });
      } catch (err: any) {
        console.error('Error updating counter status:', err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // إضافة مكتب جديد (من لوحة الإدارة)
    socket.on('addCounter', async (callback) => {
      try {
        // إضافة مكتب جديد
        const newCounter = await db.addCounter();

        // إرسال حدث إضافة مكتب جديد
        io!.emit(EVENTS.COUNTER_ADDED, newCounter);

        // إرسال حالة الطابور المحدثة
        io!.emit(EVENTS.QUEUE_STATE, db.getQueueState());

        if (callback) callback({ success: true, counter: newCounter });
      } catch (err: any) {
        console.error('Error adding counter:', err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // الحصول على حالة الطابور الحالية
    socket.on('getQueueState', (callback) => {
      const queueState = db.getQueueState();
      if (callback) callback(queueState);
    });

    // التعامل مع قطع الاتصال
    socket.on(EVENTS.DISCONNECT, (reason) => {
      console.log(`Client disconnected: ${socket.id}, Reason: ${reason}`);

      // Check if we should attempt reconnect based on disconnect reason
      if (reason === 'io server disconnect') {
        // The server initiated the disconnect, the client should reconnect
        console.log(`Server initiated disconnect for ${socket.id}, client should reconnect`);
      }

      // Clean up any resources for this socket if needed
    });
  });

  // Register error handler for the server
  io.engine.on('connection_error', (err) => {
    console.error('Connection error:', err);
  });

  httpServer.listen(port, () => {
    console.log(`Express+Socket.IO server running on http://localhost:${port}`);
  });

  return io;
}

export function stopSocketServer() {
  if (io) {
    io.close();
    io = null;
  }
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
  console.log('Socket.IO server stopped');
}

// تصدير الأحداث لاستخدامها في العملاء
export { EVENTS };
