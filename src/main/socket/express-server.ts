import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import * as os from 'os';
import {
  initializeHeartbeat,
  markAsEmployee,
  removeHeartbeat,
  startHeartbeatMonitoring,
  stopHeartbeatMonitoring
} from './heartbeat';

// Queue state type definitions
interface Ticket {
  id: number;
  timestamp: number;
  status: string;
  serviceType: string;
  counterNumber?: number;
  servedByCounterId?: number; // Add field to track which counter is serving this ticket
  extraData?: Record<string, any>;
}

interface Counter {
  id: number;
  busy: boolean;
  currentTicket: number | null;
  status: string;
  extraData?: Record<string, any>;
}

interface QueueState {
  tickets: Ticket[];
  lastTicketNumber: number;
  counters: Counter[];
  extraData?: Record<string, any>;
}

// In-memory queue state (will be replaced by the state from main process)
let queueState: QueueState = {
  tickets: [],
  lastTicketNumber: 0,
  counters: [{ id: 1, busy: false, currentTicket: null, status: 'active' }],
  extraData: {}
};

let io: Server | null = null;
let httpServer: ReturnType<typeof createServer> | null = null;
let connectedClients: Set<string> = new Set();

// Add this line to declare heartbeatInterval
let heartbeatInterval: NodeJS.Timeout | null = null;

// Track client-counter relationships with a map of socketId to counterId
const socketToCounterMap = new Map<string, number>();
// Track which counter IDs are in use with a set
const usedCounterIds = new Set<number>();
// Track which client types are employee screens
const employeeScreens = new Set<string>();

// Function to get the next available counter ID
function getNextAvailableCounterId(): number {
  let id = 1;
  while (usedCounterIds.has(id)) {
    id++;
  }
  return id;
}

// Function to assign a counter ID to a socket
function assignCounterId(socketId: string): number {
  // If this socket already has a counter ID, return it
  if (socketToCounterMap.has(socketId)) {
    return socketToCounterMap.get(socketId)!;
  }

  // Get the next available ID
  const counterId = getNextAvailableCounterId();

  // Mark the ID as used and map it to this socket
  usedCounterIds.add(counterId);
  socketToCounterMap.set(socketId, counterId);

  console.log(`[Server] Assigned counter ID ${counterId} to employee client ${socketId}`);

  // Also update the counters array if this counter doesn't exist yet
  if (!queueState.counters.some(counter => counter.id === counterId)) {
    queueState.counters.push({
      id: counterId,
      busy: false,
      currentTicket: null,
      status: 'active'
    });
    console.log(`[Server] Added new counter ${counterId} to queue state`);
  }

  return counterId;
}

// Function to release a counter ID when a socket disconnects
function releaseCounterId(socketId: string): void {
  if (socketToCounterMap.has(socketId)) {
    const counterId = socketToCounterMap.get(socketId)!;
    usedCounterIds.delete(counterId);
    socketToCounterMap.delete(socketId);
    console.log(`[Server] Released counter ID ${counterId} from client ${socketId}`);
  }
}

// Function to get local IP address
function getLocalIpAddress(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Update queue state and broadcast to all clients
export function updateQueueState(newState: QueueState): void {
  // استخدام نسخة عميقة من الكائن لتجنب مشاكل المراجع
  queueState = JSON.parse(JSON.stringify(newState));

  if (io) {
    // تحسين كفاءة نقل البيانات - إرسال الحد الأدنى من البيانات المطلوبة فقط
    const minimalState = {
      tickets: queueState.tickets.map(t => ({
        id: t.id,
        status: t.status,
        counterNumber: t.counterNumber,
        serviceType: t.serviceType,
        // لا نرسل timestamp أو extraData إلا إذا كانت ضرورية
      })),
      lastTicketNumber: queueState.lastTicketNumber,
      counters: queueState.counters.map(c => ({
        id: c.id,
        busy: c.busy,
        currentTicket: c.currentTicket,
        status: c.status
      }))
    };

    io.emit('queueState', minimalState);
  }
}

// نقل قائمة الإعلانات خارج مستمع الاتصال لتكون مشتركة بين جميع الاتصالات
type CallAnnouncement = {
  ticket: Ticket;
  counterId: number;
  timestamp: number;
};

// تخزين قائمة الإعلانات بشكل عام (مشترك لجميع الاتصالات)
let globalAnnouncementQueue: CallAnnouncement[] = [];
let isAnnouncementInProgress = false;
let announcementTimer: NodeJS.Timeout | null = null;

// المدة التي يستغرقها الإعلان الصوتي (بالملي ثانية)
const ANNOUNCEMENT_DURATION = 6000; // 6 ثوان

// إضافة إعلان إلى قائمة الانتظار وبدء المعالجة إذا لم تكن جارية
function addToAnnouncementQueue(ticket: Ticket, counterId: number): void {
  // إضافة الإعلان إلى نهاية القائمة
  globalAnnouncementQueue.push({
    ticket,
    counterId,
    timestamp: Date.now()
  });

  console.log(`[AnnouncementQueue] Added ticket ${ticket.id} to queue (length: ${globalAnnouncementQueue.length})`);

  // إذا لم تكن هناك معالجة جارية، ابدأ معالجة الإعلانات
  if (!isAnnouncementInProgress) {
    console.log(`[AnnouncementQueue] Starting announcement processing`);
    processNextAnnouncement();
  } else {
    console.log(`[AnnouncementQueue] Announcement already in progress, will process ticket ${ticket.id} in queue`);
  }
}

// معالجة الإعلان التالي في القائمة
function processNextAnnouncement(): void {
  // إذا كانت القائمة فارغة، قم بإنهاء المعالجة
  if (globalAnnouncementQueue.length === 0) {
    console.log(`[AnnouncementQueue] Queue is empty, stopping processing`);
    isAnnouncementInProgress = false;
    return;
  }

  // تعيين حالة المعالجة
  isAnnouncementInProgress = true;

  // الحصول على الإعلان التالي من بداية القائمة
  const announcement = globalAnnouncementQueue.shift();
  if (!announcement) {
    console.log(`[AnnouncementQueue] No announcement found, stopping processing`);
    isAnnouncementInProgress = false;
    return;
  }

  const { ticket, counterId, timestamp } = announcement;

  console.log(`[AnnouncementQueue] Processing announcement for ticket ${ticket.id} at counter ${counterId}`);

  // إرسال الإعلان إلى جميع العملاء
  io?.emit('ticketCalled', {
    ticket,
    counterId,
    timestamp: Date.now()
  });

  console.log(`[AnnouncementQueue] Sent announcement for ticket ${ticket.id}, waiting ${ANNOUNCEMENT_DURATION}ms before next announcement`);

  // إنشاء مؤقت للإعلان التالي
  if (announcementTimer) {
    clearTimeout(announcementTimer);
  }

  announcementTimer = setTimeout(() => {
    console.log(`[AnnouncementQueue] Announcement timer completed for ticket ${ticket.id}`);
    // معالجة الإعلان التالي بعد انتهاء المدة
    processNextAnnouncement();
  }, ANNOUNCEMENT_DURATION);
}

// Start Express + Socket.IO server
export function startServer(port: number = 4000, stateCallback?: (state: QueueState) => void): Promise<{ url: string; localIp: string }> {
  return new Promise((resolve, reject) => {
    try {
      // Create Express app
      const app = express();
      app.use(cors());
      app.use(express.json());

      // Create HTTP server
      httpServer = createServer(app);

      // Create Socket.IO server
      io = new Server(httpServer, {
        cors: {
          origin: '*',
          methods: ['GET', 'POST'],
        },
        serveClient: false,
        pingTimeout: 20000,
        pingInterval: 10000,
      });

      // Start heartbeat monitoring
      heartbeatInterval = startHeartbeatMonitoring(io);

      // Set up Socket.IO connection handler
      io.on('connection', (socket) => {
        console.log(`[Server] Client connected: ${socket.id}`);
        connectedClients.add(socket.id);

        // Initialize heartbeat monitoring for this client
        initializeHeartbeat(socket);

        // Send current queue state to new client
        socket.emit('queueState', queueState);

        // Listen for screen type registration
        socket.on('registerScreen', (screenType) => {
          if (screenType === 'employee') {
            // Mark this socket as an employee screen
            employeeScreens.add(socket.id);

            // Assign a counter ID only if this is an employee screen
            const counterId = assignCounterId(socket.id);

            // Mark in heartbeat system
            markAsEmployee(socket.id, counterId);

            // Send the assigned counter ID to the client
            socket.emit('assignedCounterId', counterId);

            console.log(`[Server] Registered employee screen with counter ID ${counterId}: ${socket.id}`);
          } else {
            console.log(`[Server] Registered ${screenType} screen: ${socket.id}`);
          }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
          console.log(`[Server] Client disconnected: ${socket.id}`);
          connectedClients.delete(socket.id);

          // Clean up heartbeat
          removeHeartbeat(socket.id);

          // If this was an employee screen, release its counter ID
          if (employeeScreens.has(socket.id)) {
            releaseCounterId(socket.id);
            employeeScreens.delete(socket.id);
          }
        });

        // Handle ping requests (for heartbeat)
        socket.on('ping', (callback) => {
          if (typeof callback === 'function') {
            callback({ timestamp: Date.now() });
          }
        });

        // Get queue state
        socket.on('getQueueState', (callback) => {
          if (typeof callback === 'function') {
            callback(queueState);
          }
        });

        // Add ticket
        socket.on('add-ticket', (data, callback) => {
          if (!data.serviceType) {
            if (typeof callback === 'function') {
              callback({ error: 'Service type is required' });
            }
            return;
          }

          const newTicketNumber = queueState.lastTicketNumber + 1;
          const newTicket = {
            id: newTicketNumber,
            timestamp: Date.now(),
            status: 'waiting',
            serviceType: data.serviceType,
            ...(data.customerName ? { customerName: data.customerName } : {})
          };

          queueState.tickets.push(newTicket);
          queueState.lastTicketNumber = newTicketNumber;

          // Notify all clients
          io?.emit('queueState', queueState);
          io?.emit('ticketAdded', newTicket);

          // Call the state callback if provided
          if (stateCallback) {
            stateCallback(queueState);
          }

          if (typeof callback === 'function') {
            callback(newTicket);
          }
        });

        // Handle callNextCustomer with proper counter tracking
        socket.on('callNextCustomer', async (arg, callback) => {
          try {
            const safeCounterId = extractCounterId(arg);
            console.log(`[Server] callNextCustomer request for counter ${safeCounterId}`);

            if (!safeCounterId || isNaN(safeCounterId) || safeCounterId <= 0) {
              console.error(`[Server] Invalid counter ID:`, arg);
              if (typeof callback === 'function') {
                callback({ success: false, error: 'Invalid counter ID' });
              }
              return;
            }

            // Validate that this socket is authorized for this counter ID
            if (socketToCounterMap.has(socket.id) && socketToCounterMap.get(socket.id) !== safeCounterId) {
              console.error(`[Server] Unauthorized counter ID: Socket ${socket.id} assigned to counter ${socketToCounterMap.get(socket.id)} tried to use counter ${safeCounterId}`);
              if (typeof callback === 'function') {
                callback({ success: false, error: 'Unauthorized counter ID' });
              }
              return;
            }

            // Find the next waiting ticket (FIFO)
            const nextTicket = queueState.tickets.find((ticket) => ticket.status === 'waiting');

            if (!nextTicket) {
              console.log(`[Server] No waiting tickets for counter ${safeCounterId}`);
              if (typeof callback === 'function') {
                callback({ success: false, error: 'No waiting tickets' });
              }
              return;
            }

            console.log(`[Server] Found next waiting ticket: ${nextTicket.id} for counter ${safeCounterId}`);

            // Ensure counter exists
            let counterExists = queueState.counters.some((counter) => counter.id === safeCounterId);
            if (!counterExists) {
              queueState.counters.push({
                id: safeCounterId,
                busy: false,
                currentTicket: null,
                status: 'active'
              });
            }

            // قم بتخزين نسخة من التذكرة قبل تغيير حالتها للإعلان
            const ticketForAnnouncement = { ...nextTicket };

            // Assign ticket to counter
            queueState.tickets = queueState.tickets.map((ticket) =>
              ticket.id === nextTicket.id
                ? {
                    ...ticket,
                    status: 'serving',
                    counterNumber: safeCounterId,
                    servedByCounterId: safeCounterId
                  }
                : ticket
            );

            queueState.counters = queueState.counters.map((counter) =>
              counter.id === safeCounterId
                ? { ...counter, busy: true, currentTicket: nextTicket.id }
                : counter
            );

            console.log(`[Server] Updated ticket ${nextTicket.id} status to 'serving' with counter ${safeCounterId}`);

            // تحديث حالة الطابور لجميع العملاء فوراً
            io?.emit('queueState', queueState);
            console.log(`[Server] Broadcast queueState to all clients`);

            // إضافة الإعلان إلى قائمة الانتظار العامة
            addToAnnouncementQueue(
              { ...ticketForAnnouncement, counterNumber: safeCounterId },
              safeCounterId
            );

            // إعادة الاستجابة فوراً للموظف دون انتظار انتهاء الإعلان
            if (typeof callback === 'function') {
              callback({
                success: true,
                ticket: nextTicket,
                message: `تم إضافة التذكرة ${nextTicket.id} إلى قائمة الإعلانات`
              });
            }

            // Call the state callback if provided
            if (typeof stateCallback === 'function') {
              stateCallback(queueState);
            }
          } catch (error) {
            console.error('[Server] Error processing callNextCustomer:', error);
            if (typeof callback === 'function') {
              callback({ success: false, error: 'Internal server error' });
            }
          }
        });

        // Handle completeService with ownership verification
        socket.on('completeService', (arg, callback) => {
          const safeCounterId = extractCounterId(arg);
          console.log(`[Server] completeService request for counter`, safeCounterId);

          if (!safeCounterId || isNaN(safeCounterId) || safeCounterId <= 0) {
            console.error(`[Server] Invalid counter ID in completeService:`, arg);
            if (typeof callback === 'function') {
              callback({ success: false, error: 'Invalid counter ID' });
            }
            return;
          }

          // Validate that this socket is authorized for this counter ID
          if (socketToCounterMap.has(socket.id) && socketToCounterMap.get(socket.id) !== safeCounterId) {
            console.error(`[Server] Unauthorized counter ID: Socket ${socket.id} assigned to counter ${socketToCounterMap.get(socket.id)} tried to use counter ${safeCounterId}`);
            if (typeof callback === 'function') {
              callback({ success: false, error: 'Unauthorized counter ID' });
            }
            return;
          }

          const counter = queueState.counters.find((c) => c.id === safeCounterId);

          if (!counter) {
            console.log(`[Server] Counter ${safeCounterId} not found in completeService`);
            if (typeof callback === 'function') {
              callback({ success: false, error: 'Counter not found' });
            }
            return;
          }

          if (counter.currentTicket === null) {
            console.log(`[Server] No active ticket for counter ${safeCounterId}`);
            if (typeof callback === 'function') {
              callback({ success: false, error: 'No active ticket for this counter' });
            }
            return;
          }

          // Verify ticket ownership - check if this counter is the one serving the ticket
          const currentTicket = queueState.tickets.find(t => t.id === counter.currentTicket);

          if (!currentTicket) {
            console.log(`[Server] Ticket ${counter.currentTicket} not found for counter ${safeCounterId}`);
            if (typeof callback === 'function') {
              callback({ success: false, error: 'Ticket not found' });
            }
            return;
          }

          if (currentTicket.servedByCounterId !== safeCounterId) {
            console.error(`[Server] Ownership error: Counter ${safeCounterId} trying to complete ticket ${counter.currentTicket} which belongs to counter ${currentTicket.servedByCounterId}`);
            if (typeof callback === 'function') {
              callback({
                success: false,
                error: `غير مسموح بإنهاء خدمة هذا العميل، تم استدعاؤه بواسطة مكتب ${currentTicket.servedByCounterId}`
              });
            }
            return;
          }

          const currentTicketId = counter.currentTicket;
          console.log(`[Server] Completing service for ticket ${currentTicketId} at counter ${safeCounterId}`);

          // Update ticket status
          queueState.tickets = queueState.tickets.map((ticket) =>
            ticket.id === currentTicketId
              ? { ...ticket, status: 'complete' }
              : ticket
          );

          // Update counter status
          queueState.counters = queueState.counters.map((c) =>
            c.id === safeCounterId
              ? { ...c, busy: false, currentTicket: null }
              : c
          );

          console.log(`[Server] Updated ticket ${currentTicketId} status to 'complete'`);
          console.log(`[Server] Updated counter ${safeCounterId} status to not busy`);

          // Notify all clients
          io?.emit('queueState', queueState);
          io?.emit('ticketCompleted', { counterId: safeCounterId, ticketId: currentTicketId });

          // Call the state callback if provided
          if (stateCallback) {
            stateCallback(queueState);
          }

          if (typeof callback === 'function') {
            callback({ success: true });
          }
        });

        // Update counter status
        socket.on('updateCounterStatus', (data, callback) => {
          if (!data || typeof data.counterId !== 'number' || !data.status) {
            if (typeof callback === 'function') {
              callback({ success: false, error: 'Invalid request' });
            }
            return;
          }

          // Update counter status
          queueState.counters = queueState.counters.map((counter) =>
            counter.id === data.counterId
              ? { ...counter, status: data.status }
              : counter
          );

          // Notify all clients
          io?.emit('queueState', queueState);
          io?.emit('counterStatusChanged', { counterId: data.counterId, status: data.status });

          // Call the state callback if provided
          if (stateCallback) {
            stateCallback(queueState);
          }

          if (typeof callback === 'function') {
            callback({ success: true });
          }
        });

        // Get network info
        socket.on('get-network-info', (callback) => {
          if (typeof callback === 'function') {
            callback({
              localIp: getLocalIpAddress(),
              isConnected: true,
              serverPort: port
            });
          }
        });
      });

      // Simple health check endpoint
      app.get('/health', (req, res) => {
        res.json({
          status: 'ok',
          clients: connectedClients.size,
          uptime: process.uptime()
        });
      });

      // Start server
      httpServer.listen(port, () => {
        console.log(`[Server] Starting Express+Socket.IO server on port ${port}...`);
        console.log(`Socket.IO server started on ${getLocalIpAddress()}:${port}`);
        console.log(`Express+Socket.IO server running on http://localhost:${port}`);
        resolve({ url: `http://localhost:${port}`, localIp: getLocalIpAddress() });
      });
    } catch (error) {
      console.error('[Server] Error starting server:', error);
      reject(error);
    }
  });
}

// Stop server
export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (heartbeatInterval) {
      stopHeartbeatMonitoring(heartbeatInterval);
      heartbeatInterval = null;
    }

    // إلغاء مؤقت الإعلانات إذا كان موجوداً
    if (announcementTimer) {
      clearTimeout(announcementTimer);
      announcementTimer = null;
    }

    if (io && httpServer) {
      io.close(() => {
        console.log('[Server] Socket.IO server closed');
        httpServer!.close(() => {
          console.log('[Server] HTTP server closed');
          io = null;
          httpServer = null;
          resolve();
        });
      });
    } else {
      resolve();
    }
  });
}

// Export the function to set initial state
export function setInitialState(state: QueueState): void {
  queueState = { ...state };
}

// Helper to extract counterId from argument (number or object)
function extractCounterId(arg: any): number | null {
  if (typeof arg === 'number') return arg;
  if (arg && typeof arg.counterId === 'number') return arg.counterId;
  return null;
}

// Default export
export default {
  startServer,
  stopServer,
  updateQueueState,
  setInitialState
};
