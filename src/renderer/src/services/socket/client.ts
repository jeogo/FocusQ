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

// Define the config interface
export interface SocketConfig {
  serverHost: string;
  serverPort: number;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
}

// defaultConfig should be empty; all config must come from socketConfig.json
const defaultConfig: SocketConfig = {
  serverHost: '',
  serverPort: 0
};

// Enhanced connection status interface to include counter ID
export interface ConnectionStatus {
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  lastConnected: Date | null;
  lastError: Error | null;
  reconnectAttempt?: number;
  latency?: number;
  counterId?: number; // Add counter ID to connection status
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

// استخدم فترة نبضات (heartbeat) أقل من مهلة السيرفر (مثلاً 5000ms)
let HEARTBEAT_INTERVAL = 5000; // 5 ثوانٍ
let HEARTBEAT_TIMEOUT = 12000; // 12 ثانية (يجب أن تكون أقل من مهلة السيرفر بقليل)

async function sendHeartbeat() {
  if (!socket?.connected) {
    console.log('Heartbeat: Socket disconnected');
    return;
  }

  try {
    const startTime = Date.now();
    const heartbeatPromise = new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Heartbeat timeout'));
      }, HEARTBEAT_TIMEOUT);

      socket!.emit('ping', (response: { timestamp?: number }) => {
        clearTimeout(timeout);
        resolve(!!response && !!response.timestamp);
      });
    });

    const isAlive = await heartbeatPromise;
    const latency = Date.now() - startTime;

    if (isAlive) {
      updateConnectionStatus('connected', null, { latency });
    } else {
      console.warn('Invalid heartbeat response');
      socket?.disconnect();
    }
  } catch (error) {
    console.error('Heartbeat failed:', error);
    socket?.disconnect();
  }
}

// Start heartbeat monitoring
function startHeartbeat(interval = HEARTBEAT_INTERVAL) {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  heartbeatInterval = setInterval(sendHeartbeat, interval);
  console.log(`Heartbeat monitoring started (interval: ${interval}ms)`);
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
  if (reconnectAttempts >= (defaultConfig.reconnectionAttempts ?? 5)) {
    if (reconnectAttempts > maxReconnectAttempts) {
      maxReconnectAttempts = reconnectAttempts;
      console.error(`Maximum reconnection attempts (${defaultConfig.reconnectionAttempts ?? 5}) reached`);
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
  const baseDelay = (defaultConfig.reconnectionDelay ?? 2000) * Math.pow(1.5, reconnectAttempts);
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

let loadedConfig: SocketConfig | null = null;
let configPromise: Promise<SocketConfig> | null = null;

// Load config with better fallback mechanism
async function getSocketConfig(): Promise<SocketConfig> {
  if (loadedConfig) return loadedConfig;
  if (!configPromise) {
    configPromise = fetch('/config/socketConfig.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load socketConfig.json');
        return res.json();
      })
      .then((json: Partial<SocketConfig> | null) => {
        if (!json || !json.serverHost || !json.serverPort) {
          throw new Error('socketConfig.json missing required fields (serverHost or serverPort)');
        }
        loadedConfig = {
          ...defaultConfig,
          ...json,
          serverHost: json.serverHost,
          serverPort: json.serverPort,
          reconnectionAttempts: json.reconnectionAttempts ?? 5,
          reconnectionDelay: json.reconnectionDelay ?? 2000,
          heartbeatInterval: json.heartbeatInterval ?? 10000,
          heartbeatTimeout: json.heartbeatTimeout ?? 20000
        };
        console.log('[Socket] Loaded config from JSON:', loadedConfig);
        return loadedConfig;
      })
      .catch((err) => {
        console.error('Failed to load socket config, cannot connect:', err);
        throw err;
      });
  }
  return configPromise;
}

// Improve socket options
export async function connectToServer(config?: SocketConfig): Promise<Socket> {
  // Add timestamp to prevent rapid reconnection attempts
  const now = Date.now();
  if (now - lastConnectionAttempt < 2000) {
    console.log('[Socket] Avoiding rapid reconnection attempts');
    if (socket?.connected) return socket;
  }
  lastConnectionAttempt = now;

  // Always load config from socketConfig.json (unless explicitly passed)
  const usedConfig = config ?? await getSocketConfig();
  const serverHost = usedConfig.serverHost;
  const serverPort = usedConfig.serverPort;
  if (!serverHost || !serverPort) {
    throw new Error('Socket config missing serverHost or serverPort');
  }
  const updatedConfig = { ...usedConfig };

  console.log(`[Socket] Using server address from config: ${serverHost}:${serverPort}`);

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
    serverUrl = `http://${serverHost}:${serverPort}`;
    console.log(`[Socket] Connecting to Socket.IO server at ${serverUrl}`);

    socket = io(serverUrl, {
      reconnectionAttempts: 0,
      reconnection: false,
      timeout: 5000,         // Reduced timeout
      autoConnect: true,
      forceNew: true,
      transports: ['polling', 'websocket'], // Try polling first, then websocket
      path: '/socket.io',
      extraHeaders: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
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

      // When reconnected, re-register as employee screen if needed
      if (wasEmployee) {
        registerAsEmployeeScreen();
      }
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

    // الإعلان عن تغيير socket
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('socket-changed'));
    }

    // Return new Promise to wait for connection
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!socket?.connected) {
          isConnecting = false;
          socket?.close();
          const error = new Error('Connection timeout');
          console.error('[Socket] Connection timeout after 5 seconds');
          updateConnectionStatus('error', error);
          reject(error);
        }
      }, 5000); // Reduced to 5 seconds

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

    // الإعلان عن تغيير socket
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('socket-changed'));
    }
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
    const config = await getSocketConfig();
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
async function fetchLocalIpAndReconnect(config?: SocketConfig) {
  try {
    const usedConfig = config ?? await getSocketConfig();
    await connectToServer(usedConfig);
    // Ask server for its local IP
    const info = await getNetworkInfo();
    if (info.localIp && info.localIp !== usedConfig.serverHost) {
      // If local IP is different, reconnect using it
      usedConfig.serverHost = info.localIp;
      disconnectFromServer();
      await connectToServer(usedConfig);
    }
  } catch (e) {
    console.error('Failed to fetch local IP and reconnect:', e);
  }
}

export async function connectWithLocalIp(config?: SocketConfig) {
  await fetchLocalIpAndReconnect(config);
}

// Track if this client was registered as an employee screen
let wasEmployee = false;

// تسجيل للخادم كشاشة موظف
export function registerAsEmployeeScreen(): void {
  if (socket?.connected) {
    socket.emit('registerScreen', 'employee');
    console.log('[Socket] Registered as employee screen');
    wasEmployee = true; // Mark that this client is an employee screen
  } else {
    console.error('[Socket] Cannot register as employee - not connected');
  }
}

// الاستماع لتعيين رقم المكتب
export function listenForCounterId(callback: (counterId: number) => void): () => void {
  if (!socket) {
    console.error('[Socket] Cannot listen for counter ID - no socket');
    return () => {};
  }

  socket.on('assignedCounterId', (counterId: number) => {
    console.log(`[Socket] Received assigned counter ID: ${counterId}`);

    // Update connection status with the counter ID
    if (currentStatus.status === 'connected') {
      updateConnectionStatus('connected', null, { counterId });
    }

    callback(counterId);
  });

  return () => {
    socket?.off('assignedCounterId');
  };
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
