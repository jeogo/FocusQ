import { io, Socket } from 'socket.io-client';
import { useEffect, useState } from 'react';

// Socket client singleton
let socket: Socket | null = null;
let isConnecting = false;
let serverUrl: string = '';
let heartbeatInterval: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
let reconnectTimer: NodeJS.Timeout | null = null;
let maxReconnectAttempts = 0;
let lastConnectionAttempt = 0;

// Flag to track if the app is still active
let isAppActive = true;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    isAppActive = false;
  });
}

// Default server config - استخدام عنوان IP المحدد
const defaultConfig = {
  serverHost: '192.168.1.14', // تعيين عنوان IP الخادم المركزي
  serverPort: 4000,           // تعيين منفذ الخادم المركزي
  reconnectionAttempts: 15,
  reconnectionDelay: 1000,
  timeout: 10000,
  heartbeatInterval: 10000,
  heartbeatTimeout: 5000
};

// Connection status
export interface ConnectionStatus {
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  lastConnected: Date | null;
  lastError: Error | null;
  reconnectAttempt?: number;
  latency?: number;
}

// Connection status observers
const statusObservers: ((status: ConnectionStatus) => void)[] = [];
// Current connection status
let currentStatus: ConnectionStatus = {
  status: 'disconnected',
  lastConnected: null,
  lastError: null
};

// Update connection status and notify all observers
function updateConnectionStatus(
  status: ConnectionStatus['status'],
  error: Error | null = null,
  additionalInfo: Partial<ConnectionStatus> = {}
) {
  if (status === 'connected') {
    currentStatus = {
      status,
      lastConnected: new Date(),
      lastError: null,
      reconnectAttempt: 0,
      ...additionalInfo
    };
  } else if (status === 'error') {
    currentStatus = {
      ...currentStatus,
      status,
      lastError: error,
      ...additionalInfo
    };
  } else {
    currentStatus = {
      ...currentStatus,
      status,
      ...additionalInfo
    };
  }

  // Notify all observers of the status change
  statusObservers.forEach(observer => observer(currentStatus));
}

// Heartbeat function to verify if connection is still alive
async function sendHeartbeat() {
  if (!socket?.connected) {
    console.log('Heartbeat: Socket disconnected, attempting to reconnect');
    triggerReconnect();
    return;
  }

  try {
    const startTime = Date.now();
    // Set up a timeout for the heartbeat
    const heartbeatPromise = new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Heartbeat timeout'));
      }, defaultConfig.heartbeatTimeout);

      socket!.emit('ping', (response: { timestamp?: number }) => {
        clearTimeout(timeout);
        resolve(!!response && !!response.timestamp);
      });
    });

    const isAlive = await heartbeatPromise;
    const latency = Date.now() - startTime;

    if (isAlive) {
      // Only log every 5 heartbeats to reduce console spam
      if (Math.random() < 0.2) {
        console.log(`Heartbeat successful, latency: ${latency}ms`);
      }

      // Update connection status with latency information
      updateConnectionStatus('connected', null, { latency });
    } else {
      console.warn('Heartbeat received invalid response');
      triggerReconnect();
    }
  } catch (error) {
    console.error('Heartbeat failed:', error);
    // Socket might be connected but not responding, force reconnect
    triggerReconnect();
  }
}

// Start heartbeat monitoring
function startHeartbeat(interval = defaultConfig.heartbeatInterval) {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  heartbeatInterval = setInterval(sendHeartbeat, interval);
  console.log(`Heartbeat monitoring started (interval: ${interval}ms)`);

  // Send an immediate heartbeat to check connection
  sendHeartbeat();
}

// Stop heartbeat monitoring
function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    console.log('Heartbeat monitoring stopped');
  }
}

// Trigger reconnection
function triggerReconnect() {
  if (socket) {
    // Clean up existing socket
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  // Reset connection status with reconnect attempt info
  updateConnectionStatus('disconnected', null, { reconnectAttempt: reconnectAttempts + 1 });

  // Clear any existing reconnect timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  // Check if we've exceeded max reconnection attempts
  if (reconnectAttempts >= defaultConfig.reconnectionAttempts) {
    if (reconnectAttempts > maxReconnectAttempts) {
      maxReconnectAttempts = reconnectAttempts;
      console.error(`Maximum reconnection attempts (${defaultConfig.reconnectionAttempts}) reached`);
    }

    // Continue retrying but at a much slower rate (every 30 seconds)
    reconnectTimer = setTimeout(() => {
      console.log('Periodic reconnection attempt after max attempts');
      connectToServer().catch(error => {
        console.error('Periodic reconnection attempt failed:', error);
      });
    }, 30000);

    return;
  }

  // Exponential backoff for reconnection with jitter to prevent thundering herd
  const baseDelay = defaultConfig.reconnectionDelay * Math.pow(1.5, reconnectAttempts);
  const jitter = Math.random() * 0.3 * baseDelay; // Add up to 30% jitter
  const delay = Math.min(baseDelay + jitter, 30000);

  reconnectAttempts++;

  console.log(`Scheduling reconnection attempt ${reconnectAttempts} in ${Math.round(delay)}ms`);
  reconnectTimer = setTimeout(() => {
    connectToServer().catch(error => {
      console.error('Reconnection attempt failed:', error);
    });
  }, delay);
}

// Improve connection reliability
export async function connectToServer(config = defaultConfig): Promise<Socket> {
  // Add timestamp to prevent rapid reconnection attempts
  const now = Date.now();
  if (now - lastConnectionAttempt < 2000) {
    console.log('[Socket] Avoiding rapid reconnection attempts');
    if (socket?.connected) return socket;
  }
  lastConnectionAttempt = now;

  // القيمة المحددة للخادم دائماً، وتجاهل أي محاولة للحصول على IP من العملية الرئيسية
  const serverHost = '192.168.1.14';
  const serverPort = 4000;
  const updatedConfig = { ...config, serverHost, serverPort };

  console.log(`[Socket] Using fixed server address: ${serverHost}:${serverPort}`);

  // If already connected, return existing socket
  if (socket?.connected) {
    console.log('[Socket] Already connected, reusing socket');
    return socket;
  }

  // If currently connecting, wait for it
  if (isConnecting) {
    console.log('[Socket] Connection already in progress, waiting...');
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (socket?.connected) {
          clearInterval(checkInterval);
          resolve(socket);
        } else if (!isConnecting) {
          clearInterval(checkInterval);
          reject(new Error('Connection failed while waiting'));
        }
      }, 100);
    });
  }

  isConnecting = true;
  updateConnectionStatus('connecting', null, { reconnectAttempt: reconnectAttempts });

  try {
    // Construct server URL
    serverUrl = `http://${updatedConfig.serverHost}:${updatedConfig.serverPort}`;
    console.log(`[Socket] Connecting to Socket.IO server at ${serverUrl}`);

    // Create socket with improved options
    socket = io(serverUrl, {
      reconnectionAttempts: 0, // We handle reconnection manually
      reconnection: false,
      timeout: 15000,
      autoConnect: true,
      forceNew: true,
      transports: ['websocket', 'polling'], // Try WebSocket first, fall back to polling
    });

    // Debug: log all events (except ping/pong)
    if (process.env.NODE_ENV === 'development') {
      socket.onAny((event, ...args) => {
        if (event !== 'ping' && event !== 'pong') {
          console.log('[Socket] Event:', event, args);
        }
      });
    }

    // Setup event handlers
    socket.on('connect', () => {
      console.log('[Socket] ✅ Connected to socket server');
      updateConnectionStatus('connected');
      reconnectAttempts = 0;
      startHeartbeat(updatedConfig.heartbeatInterval);
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] ❌ Connection error:', error);
      updateConnectionStatus('error', error, { reconnectAttempt: reconnectAttempts });
    });

    socket.on('error', (error) => {
      console.error('[Socket] ❌ Socket error:', error);
      updateConnectionStatus('error', typeof error === 'object' ? error : new Error(String(error)));
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected. Reason: ${reason}`);
      updateConnectionStatus('disconnected', null, { lastError: new Error(reason) });
      stopHeartbeat();
      
      // If server initiated disconnect, try to reconnect after a delay
      if (reason === 'io server disconnect' || reason === 'transport close') {
        setTimeout(() => {
          if (isAppActive) {
            triggerReconnect();
          }
        }, 1000);
      }
    });

    // Return new Promise to wait for connection
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!socket?.connected) {
          isConnecting = false;
          const error = new Error('Connection timeout');
          console.error('[Socket] Connection timeout after 15 seconds');
          updateConnectionStatus('error', error);
          reject(error);
        }
      }, 15000); // 15 second timeout

      socket?.on('connect', () => {
        clearTimeout(timeout);
        isConnecting = false;
        resolve(socket!);
      });

      socket!?.on('connect_error', (error) => {
        clearTimeout(timeout);
        isConnecting = false;
        reject(error);
      });
    });
  } catch (error) {
    isConnecting = false;
    updateConnectionStatus('error', error as Error);
    console.error('[Socket] Error connecting to socket server:', error);
    throw error;
  } finally {
    isConnecting = false;
  }
}

// Disconnect from server
export function disconnectFromServer() {
  if (socket) {
    stopHeartbeat();
    socket.disconnect();
    socket = null;
    updateConnectionStatus('disconnected');
  }
}

// Get current socket instance
export function getSocket(): Socket | null {
  return socket;
}

// Get server URL
export function getServerUrl(): string {
  return serverUrl;
}

// Get connection status
export function getConnectionStatus(): ConnectionStatus {
  return currentStatus;
}

// Subscribe to connection status changes
export function subscribeToConnectionStatus(callback: (status: ConnectionStatus) => void): () => void {
  statusObservers.push(callback);

  // Call immediately with current status
  callback(currentStatus);

  // Return unsubscribe function
  return () => {
    const index = statusObservers.indexOf(callback);
    if (index !== -1) {
      statusObservers.splice(index, 1);
    }
  };
}

// React hook for connection status
export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(currentStatus);

  useEffect(() => {
    const unsubscribe = subscribeToConnectionStatus(setStatus);
    return unsubscribe;
  }, []);

  return status;
}

// React hook for socket instance
export function useSocket(): Socket | null {
  const [socketInstance, setSocketInstance] = useState<Socket | null>(socket);

  useEffect(() => {
    if (socket) {
      setSocketInstance(socket);
    } else {
      // Try to get existing socket or connect
      const getSocketInstance = async () => {
        try {
          const socket = await connectToServer();
          setSocketInstance(socket);
        } catch (error) {
          console.error('Error getting socket in hook:', error);
        }
      };

      getSocketInstance();
    }

    // Listen for connection status changes
    const handleStatusChange = (status: ConnectionStatus) => {
      if (status.status === 'connected' && socket) {
        setSocketInstance(socket);
      } else if (status.status === 'disconnected') {
        setSocketInstance(null);
      }
    };

    const unsubscribe = subscribeToConnectionStatus(handleStatusChange);
    return unsubscribe;
  }, []);

  return socketInstance;
}

// Function to verify connection by pinging the server
export async function verifyConnection(): Promise<boolean> {
  if (!socket?.connected) {
    return false;
  }

  try {
    const response = await new Promise<{timestamp?: number}>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Ping timeout')), defaultConfig.heartbeatTimeout);

      socket!.emit('ping', (response: {timestamp?: number}) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });

    return !!response && !!response.timestamp;
  } catch (error) {
    console.error('Connection verification failed:', error);
    return false;
  }
}

// Manual reconnect function - can be called from UI
export async function reconnectToServer(): Promise<boolean> {
  stopHeartbeat();

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  // Reset reconnection attempts when manually reconnecting
  reconnectAttempts = 0;
  maxReconnectAttempts = 0;

  try {
    // استخدام العنوان الثابت دائمًا
    const config = {
      ...defaultConfig,
      serverHost: '192.168.1.14',
      serverPort: 4000
    };
    
    await connectToServer(config);
    return true;
  } catch (error) {
    console.error('Manual reconnection failed:', error);
    return false;
  }
}

// Get network information from server
export async function getNetworkInfo(): Promise<{localIp: string, isConnected: boolean, serverPort: number}> {
  if (!socket?.connected) {
    throw new Error('Not connected to server');
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Network info timeout')), defaultConfig.heartbeatTimeout);

    socket!.emit('get-network-info', (response: {localIp: string, isConnected: boolean, serverPort: number}) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

// Helper to fetch the local IP and reconnect using it
async function fetchLocalIpAndReconnect(config = defaultConfig) {
  try {
    // Try connecting to localhost first
    await connectToServer(config);
    // Ask server for its local IP
    const info = await getNetworkInfo();
    if (info.localIp && info.localIp !== config.serverHost) {
      // If local IP is different, reconnect using it
      config.serverHost = info.localIp;
      disconnectFromServer();
      await connectToServer(config);
    }
  } catch (e) {
    console.error('Failed to fetch local IP and reconnect:', e);
  }
}

// Export a helper for screens to call
export async function connectWithLocalIp(config = defaultConfig) {
  await fetchLocalIpAndReconnect(config);
}

// Default export for easy importing
export default {
  connectToServer,
  disconnectFromServer,
  getSocket,
  getServerUrl,
  getConnectionStatus,
  subscribeToConnectionStatus,
  useConnectionStatus,
  useSocket,
  verifyConnection,
  getNetworkInfo,
  reconnectToServer,
  connectWithLocalIp
};
