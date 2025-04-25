import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import * as os from 'os';

// Queue state type definitions
interface Ticket {
  id: number;
  timestamp: number;
  status: string;
  serviceType: string;
  counterNumber?: number;
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
  queueState = { ...newState };
  if (io) {
    io.emit('queueState', queueState);
  }
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
      });

      // Set up Socket.IO connection handler
      io.on('connection', (socket) => {
        console.log(`[Server] Client connected: ${socket.id}`);
        connectedClients.add(socket.id);

        // Send current queue state to new client
        socket.emit('queueState', queueState);

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

        // Call next customer
        socket.on('callNextCustomer', (counterId, callback) => {
          // Find the next waiting ticket
          const nextTicket = queueState.tickets.find((ticket) => ticket.status === 'waiting');
          
          if (!nextTicket) {
            if (typeof callback === 'function') {
              callback({ success: false, error: 'No waiting tickets' });
            }
            return;
          }

          // Update ticket status
          queueState.tickets = queueState.tickets.map((ticket) =>
            ticket.id === nextTicket.id
              ? { ...ticket, status: 'serving', counterNumber: counterId }
              : ticket
          );

          // Update counter status
          queueState.counters = queueState.counters.map((counter) =>
            counter.id === counterId
              ? { ...counter, busy: true, currentTicket: nextTicket.id }
              : counter
          );

          // Notify all clients
          io?.emit('queueState', queueState);
          io?.emit('ticketCalled', { ticket: nextTicket, counterId });

          // Call the state callback if provided
          if (stateCallback) {
            stateCallback(queueState);
          }

          if (typeof callback === 'function') {
            callback({ success: true, ticket: nextTicket });
          }
        });

        // Complete service
        socket.on('completeService', (counterId, callback) => {
          const counter = queueState.counters.find((c) => c.id === counterId);
          
          if (!counter || counter.currentTicket === null) {
            if (typeof callback === 'function') {
              callback({ success: false, error: 'No active ticket for this counter' });
            }
            return;
          }

          // Update ticket status
          queueState.tickets = queueState.tickets.map((ticket) =>
            ticket.id === counter.currentTicket
              ? { ...ticket, status: 'complete' }
              : ticket
          );

          // Update counter status
          queueState.counters = queueState.counters.map((c) =>
            c.id === counterId
              ? { ...c, busy: false, currentTicket: null }
              : c
          );

          // Notify all clients
          io?.emit('queueState', queueState);
          io?.emit('ticketCompleted', { counterId, ticketId: counter.currentTicket });

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

        // Handle disconnection
        socket.on('disconnect', () => {
          console.log(`[Server] Client disconnected: ${socket.id}`);
          connectedClients.delete(socket.id);
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
        const localIp = getLocalIpAddress();
        console.log(`[Server] Starting Express+Socket.IO server on port ${port}...`);
        console.log(`Socket.IO server started on ${localIp}:${port}`);
        console.log(`Express+Socket.IO server running on http://localhost:${port}`);
        resolve({ url: `http://localhost:${port}`, localIp });
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

// Default export
export default {
  startServer,
  stopServer,
  updateQueueState,
  setInitialState
};
