import { Socket } from 'socket.io';

interface HeartbeatTracker {
  [socketId: string]: {
    lastPing: number;
    employee: boolean;
    counterId?: number;
  }
}

// Track last ping time for each client
const clientHeartbeats: HeartbeatTracker = {};

// Initialize heartbeat tracking for a new client
export function initializeHeartbeat(socket: Socket): void {
  clientHeartbeats[socket.id] = {
    lastPing: Date.now(),
    employee: false
  };
  
  // Listen for ping events from this client
  socket.on('ping', (callback) => {
    // Update last ping time
    if (clientHeartbeats[socket.id]) {
      clientHeartbeats[socket.id].lastPing = Date.now();
    }
    
    // Respond with pong
    if (typeof callback === 'function') {
      callback({ timestamp: Date.now() });
    }
  });
}

// Mark a client as an employee screen with its counter ID
export function markAsEmployee(socketId: string, counterId: number): void {
  if (clientHeartbeats[socketId]) {
    clientHeartbeats[socketId].employee = true;
    clientHeartbeats[socketId].counterId = counterId;
  }
}

// Clean up heartbeat tracking when client disconnects
export function removeHeartbeat(socketId: string): void {
  delete clientHeartbeats[socketId];
}

// Check for stale connections and disconnect them
export function checkStaleConnections(io: any): void {
  const now = Date.now();
  const timeout = 15000; // 15 seconds timeout
  
  Object.entries(clientHeartbeats).forEach(([socketId, data]) => {
    if (now - data.lastPing > timeout) {
      console.log(`[Heartbeat] Client ${socketId} has not sent a ping in over 15 seconds, disconnecting`);
      
      try {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          console.log(`[Heartbeat] Disconnecting stale client: ${socketId}`);
          socket.disconnect(true);
        }
        
        // Remove from tracking
        delete clientHeartbeats[socketId];
      } catch (error) {
        console.error(`[Heartbeat] Error disconnecting stale client ${socketId}:`, error);
      }
    }
  });
}

// Start periodic heartbeat checking
export function startHeartbeatMonitoring(io: any): NodeJS.Timeout {
  console.log('[Heartbeat] Starting heartbeat monitoring');
  return setInterval(() => checkStaleConnections(io), 10000); // Check every 10 seconds
}

// Stop heartbeat monitoring
export function stopHeartbeatMonitoring(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
}
