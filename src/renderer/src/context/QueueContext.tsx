import React, { createContext, useState, useContext, useEffect, useCallback, ReactNode } from 'react';
import * as SocketClient from '../services/socket/client';
import * as QueueService from '../services/QueueService';
import { Ticket, QueueState } from '../services/QueueService';
import { Socket } from 'socket.io-client';
import type { SocketConfig } from '../services/socket/client';

// Define the context type
export interface QueueContextType {
  queueState: QueueState | null;
  connectionStatus: SocketClient.ConnectionStatus;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  socket: Socket | null; // إضافة socket للسياق
  addTicket: (serviceType: string) => Promise<Ticket>;
  callNextCustomer: (counterId: number) => Promise<Ticket | null>;
  completeService: (counterId: number) => Promise<boolean>;
  updateCounterStatus: (counterId: number, status: string) => Promise<boolean>;
  refreshQueueState: (showLoading?: boolean) => Promise<void>;
  reconnectServer: () => Promise<boolean>;
  switchToOfflineMode: () => void;
  switchToOnlineMode: () => void;
  lastUpdated: Date;
}

// Create the context with a default value
const QueueContext = createContext<QueueContextType>({
  queueState: null,
  connectionStatus: { status: 'disconnected', lastConnected: null, lastError: null },
  isLoading: false,
  error: null,
  isConnected: false,
  socket: null, // إضافة القيمة الافتراضية
  addTicket: async () => ({ id: 0, timestamp: 0, status: 'waiting', serviceType: 'general' }),
  callNextCustomer: async () => null,
  completeService: async () => false,
  updateCounterStatus: async () => false,
  refreshQueueState: async () => {},
  reconnectServer: async () => false,
  switchToOfflineMode: () => {},
  switchToOnlineMode: () => {},
  lastUpdated: new Date()
});

// Provider component
export const QueueProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<SocketClient.ConnectionStatus>(
    SocketClient.getConnectionStatus()
  );
  const [socket, setSocket] = useState<Socket | null>(SocketClient.getSocket());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [offlineMode, setOfflineMode] = useState<boolean>(false);

  // Function to load queue state from cache when offline
  const loadFromCache = useCallback(() => {
    try {
      const cachedState = localStorage.getItem('queueState');
      if (cachedState) {
        const parsedState = JSON.parse(cachedState);
        console.log('[QueueContext] Using cached state');
        setQueueState(parsedState);
        setLastUpdated(new Date(parsedState.lastUpdated || Date.now()));
      }
    } catch (err) {
      console.error('[QueueContext] Error loading from cache:', err);
    }
  }, []);

  // Function to save queue state to cache
  const saveToCache = useCallback((state: QueueState) => {
    try {
      const stateWithTimestamp = {
        ...state,
        lastUpdated: Date.now()
      };
      localStorage.setItem('queueState', JSON.stringify(stateWithTimestamp));
    } catch (err) {
      console.error('[QueueContext] Error saving to cache:', err);
    }
  }, []);

  // Initialize connection (remove any fixed address usage)
  useEffect(() => {
    let isMounted = true;

    const initializeConnection = async () => {
      try {
        console.log('[QueueContext] Initializing connection...');
        setIsLoading(true);

        // Connect using socket client (which now has fallback mechanism)
        await SocketClient.connectToServer();

        if (!isMounted) return;

        setIsConnected(true);
        setError(null);

        // Get initial queue state
        const state = await QueueService.getQueueState();
        if (isMounted) {
          setQueueState(state);
          setLastUpdated(new Date());
          // Save to cache
          saveToCache(state);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[QueueContext] Connection error:', err);

        if (!isMounted) return;

        setIsConnected(false);
        loadFromCache();
        setError('فشل الاتصال بالخادم. يرجى التحقق من الاتصال.');
        setIsLoading(false);

        // Try reconnecting after a delay
        setTimeout(() => {
          if (isMounted && !isConnected) {
            reconnectServer();
          }
        }, 5000);
      }
    };

    // Start initialization
    initializeConnection();

    // Subscribe to connection status changes
    const unsubscribe = SocketClient.subscribeToConnectionStatus((status) => {
      if (!isMounted) return;

      setConnectionStatus(status);
      setIsConnected(status.status === 'connected');

      // If connection was lost and restored, refresh state
      if (status.status === 'connected' && !isConnected) {
        refreshQueueState(false);
      }
    });

    // Cleanup function
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // استمع للتغييرات في socket
  useEffect(() => {
    const handleSocketChange = () => {
      setSocket(SocketClient.getSocket());
    };

    window.addEventListener('socket-changed', handleSocketChange);
    return () => {
      window.removeEventListener('socket-changed', handleSocketChange);
    };
  }, []);

  // Refresh queue state
  const refreshQueueState = useCallback(async (showLoading = true) => {
    if (offlineMode) {
      console.log('[QueueContext] Offline mode, not refreshing');
      return;
    }

    if (showLoading) {
      setIsLoading(true);
    }

    try {
      if (!SocketClient.getSocket()?.connected) {
        console.log('[QueueContext] Socket exists but not connected, using cached state');
        loadFromCache();
        setIsLoading(false);
        return;
      }

      const state = await QueueService.getQueueState();
      setQueueState(state);
      setLastUpdated(new Date());
      saveToCache(state);
      setError(null);
    } catch (err) {
      console.error('[QueueContext] Error refreshing queue state:', err);
      loadFromCache();
      setError('Failed to refresh data. Using cached data.');
    } finally {
      setIsLoading(false);
    }
  }, [offlineMode, loadFromCache, saveToCache]);

  // Add ticket
  const addTicket = useCallback(async (serviceType: string): Promise<Ticket> => {
    setIsLoading(true);

    try {
      if (offlineMode) {
        throw new Error('Cannot add ticket in offline mode');
      }

      if (!SocketClient.getSocket()?.connected) {
        try {
          await reconnectServer();
        } catch (err) {
          throw new Error('Not connected to socket server');
        }
      }

      const response = await QueueService.addTicket(serviceType);
      await refreshQueueState(false);

      // Ensure we have a valid ticket object
      if (response === undefined || response === null || typeof response !== 'object' || !('id' in response)) {
        throw new Error('Invalid ticket returned from server');
      }

      return response as Ticket;
    } catch (err) {
      setError('Error adding ticket');
      // Return a dummy ticket to satisfy the return type, or rethrow the error as before
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [offlineMode, refreshQueueState]);

  // Call next customer
  const callNextCustomer = useCallback(async (counterId: number): Promise<Ticket | null> => {
    setIsLoading(true);

    try {
      if (offlineMode) {
        throw new Error('Cannot call next customer in offline mode');
      }

      if (!SocketClient.getSocket()?.connected) {
        try {
          await reconnectServer();
        } catch (err) {
          throw new Error('Not connected to socket server');
        }
      }

      const result = await QueueService.callNextCustomer(counterId);
      await refreshQueueState(false);
      // Handle the case where the result is a boolean instead of a Ticket
      if (typeof result === 'boolean') {
        return null;
      }
      return result as Ticket;
    } catch (err) {
      setError('Error calling next customer');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [offlineMode, refreshQueueState]);

  // Complete service
  const completeService = useCallback(async (counterId: number): Promise<boolean> => {
    setIsLoading(true);

    try {
      if (offlineMode) {
        throw new Error('Cannot complete service in offline mode');
      }

      if (!SocketClient.getSocket()?.connected) {
        try {
          await reconnectServer();
        } catch (err) {
          throw new Error('Not connected to socket server');
        }
      }

      await QueueService.completeService(counterId);
      await refreshQueueState(false);
      return true;
    } catch (err) {
      setError('Error completing service');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [offlineMode, refreshQueueState]);

  // Update counter status
  const updateCounterStatus = useCallback(async (counterId: number, status: string): Promise<boolean> => {
    setIsLoading(true);

    try {
      if (offlineMode) {
        throw new Error('Cannot update counter status in offline mode');
      }

      if (!SocketClient.getSocket()?.connected) {
        try {
          await reconnectServer();
        } catch (err) {
          throw new Error('Not connected to socket server');
        }
      }

      await QueueService.updateCounterStatus(counterId, status);
      await refreshQueueState(false);
      return true;
    } catch (err) {
      setError('Error updating counter status');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [offlineMode, refreshQueueState]);

  // تعديل وظيفة إعادة الاتصال للاعتماد فقط على ملف الإعدادات
  const reconnectServer = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);

    try {
      console.log('[QueueContext] Attempting to reconnect...');

      // Reconnect using config from socketConfig.json
      const success = await SocketClient.reconnectToServer();
      setIsConnected(success);

      if (success) {
        await refreshQueueState(false);
        setOfflineMode(false);
        console.log('[QueueContext] Reconnection successful');
        setError(null);
        return true;
      } else {
        console.log('[QueueContext] Reconnection failed');
        loadFromCache();
        setError('فشل الاتصال بالخادم. جاري استخدام البيانات المخزنة محلياً.');
        return false;
      }
    } catch (err) {
      console.error('[QueueContext] Error during reconnection:', err);
      setIsConnected(false);
      loadFromCache();
      setError('فشل الاتصال بالخادم. جاري استخدام البيانات المخزنة محلياً.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [refreshQueueState, loadFromCache]);

  // Switch to offline mode
  const switchToOfflineMode = useCallback(() => {
    setOfflineMode(true);
    loadFromCache();
    console.log('[QueueContext] Switched to offline mode');
  }, [loadFromCache]);

  // Switch to online mode
  const switchToOnlineMode = useCallback(() => {
    setOfflineMode(false);
    reconnectServer();
    console.log('[QueueContext] Switched to online mode');
  }, [reconnectServer]);

  return (
    <QueueContext.Provider
      value={{
        queueState,
        connectionStatus,
        isLoading,
        error,
        isConnected,
        socket, // إضافة socket للسياق
        addTicket,
        callNextCustomer,
        completeService,
        updateCounterStatus,
        refreshQueueState,
        reconnectServer,
        switchToOfflineMode,
        switchToOnlineMode,
        lastUpdated,
      }}
    >
      {children}
    </QueueContext.Provider>
  );
};

// Custom hook to use the queue context
export const useQueue = (): QueueContextType => useContext(QueueContext);
