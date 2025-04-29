import { useState, useEffect, useCallback } from 'react';
import { QueueState } from '../types';

interface UseQueueStateReturn {
  state: QueueState | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  lastUpdated: Date | null;
}

export function useQueueState(): UseQueueStateReturn {
  const [state, setState] = useState<QueueState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // وظيفة لجلب حالة الطابور من السيرفر
  const fetchQueueState = useCallback(async () => {
    try {
      setError(null);
      // @ts-expect-error: custom electron preload
      const queueState = await window.electron?.ipcRenderer?.invoke('get-queue-state');
      setState(queueState);
      setLastUpdated(new Date());
      return queueState;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      console.error('خطأ في جلب حالة الطابور:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // جلب البيانات عند تحميل المكون
  useEffect(() => {
    fetchQueueState().catch(console.error);

    // إعداد مستمع لتحديثات حالة الطابور
    const handleQueueStateUpdated = (updatedState: QueueState) => {
      setState(updatedState);
      setLastUpdated(new Date());
    };

    // @ts-expect-error: custom electron preload
    window.electron?.ipcRenderer?.on('queue-state-updated', handleQueueStateUpdated);

    // تحديث دوري كل 10 ثوانٍ
    const intervalId = setInterval(() => {
      fetchQueueState().catch(console.error);
    }, 10000);

    // إزالة المستمع عند تفكيك المكون
    return () => {
      // @ts-expect-error: custom electron preload
      window.electron?.ipcRenderer?.removeListener('queue-state-updated', handleQueueStateUpdated);
      clearInterval(intervalId);
    };
  }, [fetchQueueState]);

  // وظيفة لإعادة جلب البيانات بشكل يدوي
  const refetch = useCallback(async () => {
    setIsLoading(true);
    await fetchQueueState();
  }, [fetchQueueState]);

  return {
    state,
    isLoading,
    error,
    refetch,
    lastUpdated
  };
}
