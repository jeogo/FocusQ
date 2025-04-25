import { Socket } from 'socket.io-client';
import * as SocketClient from './socket/client';

// Queue interfaces
interface Ticket {
  id: number;
  timestamp: number;
  status: string;
  serviceType: string;
  counterNumber?: number;
  customerName?: string;
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

// Current queue state
let currentQueueState: QueueState = {
  tickets: [],
  lastTicketNumber: 0,
  counters: [],
  extraData: {}
};

// Queue state change listeners
const queueStateListeners: Array<(state: QueueState) => void> = [];

// Initialize queue service
export async function initQueueService(): Promise<QueueState> {
  // Connect to socket server
  try {
    const socket = await SocketClient.connectToServer();

    // Setup event listeners
    setupSocketEvents(socket);

    // Get initial state
    const state = await getQueueState();
    return state;
  } catch (error) {
    console.error('Failed to initialize queue service:', error);
    throw error;
  }
}

// Setup socket events
function setupSocketEvents(socket: Socket) {
  // Listen for queue state updates
  socket.on('queueState', (state: QueueState) => {
    currentQueueState = state;
    notifyQueueStateListeners(state);
  });

  // Listen for specific events
  socket.on('ticketAdded', (ticket: Ticket) => {
    console.log('New ticket added:', ticket);
  });

  socket.on('ticketCalled', (data: { ticket: Ticket, counterId: number }) => {
    console.log(`Ticket #${data.ticket.id} called to counter ${data.counterId}`);
  });

  socket.on('ticketCompleted', (data: { counterId: number, ticketId: number }) => {
    console.log(`Service completed for ticket #${data.ticketId} at counter ${data.counterId}`);
  });

  socket.on('counterStatusChanged', (data: { counterId: number, status: string }) => {
    console.log(`Counter ${data.counterId} status updated to ${data.status}`);
  });
}

// Notify all listeners of queue state changes
function notifyQueueStateListeners(state: QueueState) {
  queueStateListeners.forEach((listener) => {
    try {
      listener(state);
    } catch (e) {
      // Ignore listener errors
    }
  });
}

// Add connection validation helper
const ensureConnected = (): Socket => {
  const socket = SocketClient.getSocket();
  if (!socket || !socket.connected) {
    throw new Error('Not connected to socket server');
  }
  return socket;
};

// Get current queue state
export async function getQueueState(): Promise<QueueState> {
  const socket = SocketClient.getSocket();
  if (!socket || !socket.connected) {
    throw new Error('Not connected to socket server');
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Request timed out')), 10000);
    socket.emit('getQueueState', (state: QueueState) => {
      clearTimeout(timeout);
      if (state) {
        resolve(state);
      } else {
        reject(new Error('Invalid response from server'));
      }
    });
  });
}

// Add retry logic to critical operations
export const addTicket = async (serviceType: string): Promise<Ticket> => {
  const maxRetries = 2;
  let retryCount = 0;

  const attemptAddTicket = async (): Promise<Ticket> => {
    try {
      const socket = ensureConnected();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 10000);

        socket.emit('add-ticket', { serviceType }, (response: Ticket) => {
          clearTimeout(timeout);
          if (response) {
            resolve(response);
          } else {
            reject(new Error('Invalid response from server'));
          }
        });
      });
    } catch (error) {
      if (retryCount < maxRetries) {
        retryCount++;
        console.log(`Retrying addTicket (attempt ${retryCount}/${maxRetries})...`);
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        return attemptAddTicket();
      }
      throw error;
    }
  };

  return attemptAddTicket();
};

// Call next customer
export async function callNextCustomer(counterId: number): Promise<Ticket> {
  const socket = SocketClient.getSocket();

  if (!socket) {
    throw new Error('Not connected to socket server');
  }

  return new Promise<Ticket>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Call next customer timeout')), 5000);

    socket.emit('callNextCustomer', counterId, (response: { success: boolean, ticket?: Ticket, error?: string }) => {
      clearTimeout(timeout);

      if (response.success && response.ticket) {
        resolve(response.ticket);
      } else {
        reject(new Error(response.error || 'Failed to call next customer'));
      }
    });
  });
}

// Complete service
export async function completeService(counterId: number): Promise<boolean> {
  const socket = SocketClient.getSocket();

  if (!socket) {
    throw new Error('Not connected to socket server');
  }

  return new Promise<boolean>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Complete service timeout')), 5000);

    socket.emit('completeService', counterId, (response: { success: boolean, error?: string }) => {
      clearTimeout(timeout);

      if (response.success) {
        resolve(true);
      } else {
        reject(new Error(response.error || 'Failed to complete service'));
      }
    });
  });
}

// Update counter status
export async function updateCounterStatus(counterId: number, status: string): Promise<boolean> {
  const socket = SocketClient.getSocket();

  if (!socket) {
    throw new Error('Not connected to socket server');
  }

  return new Promise<boolean>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Update counter status timeout')), 5000);

    socket.emit('updateCounterStatus', { counterId, status }, (response: { success: boolean, error?: string }) => {
      clearTimeout(timeout);

      if (response.success) {
        resolve(true);
      } else {
        reject(new Error(response.error || 'Failed to update counter status'));
      }
    });
  });
}

// Get analytics
export async function getAnalytics(): Promise<any> {
  const socket = SocketClient.getSocket();

  if (!socket) {
    throw new Error('Not connected to socket server');
  }

  return new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Get analytics timeout')), 5000);

    socket.emit('getAnalytics', (analytics: any) => {
      clearTimeout(timeout);
      resolve(analytics);
    });
  });
}

// Get today's stats
export async function getTodayStats(): Promise<any> {
  const socket = SocketClient.getSocket();

  if (!socket) {
    throw new Error('Not connected to socket server');
  }

  return new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Get today stats timeout')), 5000);

    socket.emit('getTodayStats', (stats: any) => {
      clearTimeout(timeout);
      resolve(stats);
    });
  });
}

// Helper functions

// Get waiting tickets
export function getWaitingTickets(): Ticket[] {
  return currentQueueState.tickets.filter(ticket => ticket.status === 'waiting');
}

// Get serving tickets
export function getServingTickets(): Ticket[] {
  return currentQueueState.tickets.filter(ticket => ticket.status === 'serving');
}

// Get completed tickets
export function getCompletedTickets(): Ticket[] {
  return currentQueueState.tickets.filter(ticket => ticket.status === 'complete');
}

// Get available counters
export function getAvailableCounters(): Counter[] {
  return currentQueueState.counters.filter(counter => !counter.busy && counter.status === 'open');
}

// Get busy counters
export function getBusyCounters(): Counter[] {
  return currentQueueState.counters.filter(counter => counter.busy);
}

// Get counter by ID
export function getCounterById(counterId: number): Counter | undefined {
  return currentQueueState.counters.find(counter => counter.id === counterId);
}

// Get ticket by ID
export function getTicketById(ticketId: number): Ticket | undefined {
  return currentQueueState.tickets.find(ticket => ticket.id === ticketId);
}

// Default export
export default {
  initQueueService,
  getQueueState,
  addTicket,
  callNextCustomer,
  completeService,
  updateCounterStatus,
  getAnalytics,
  getTodayStats,
  getWaitingTickets,
  getServingTickets,
  getCompletedTickets,
  getAvailableCounters,
  getBusyCounters,
  getCounterById,
  getTicketById
};

export type { QueueState, Ticket, Counter };
