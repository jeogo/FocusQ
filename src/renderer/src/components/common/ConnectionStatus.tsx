import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

interface ConnectionStatusProps {
  compact?: boolean;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ compact = false }) => {
  const [isConnected, setIsConnected] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    // محاكاة فحص الاتصال كل 5 ثوانٍ
    const checkConnection = async () => {
      try {
        // استعلام عن حالة الاتصال من خلال IPC
        // @ts-expect-error: custom electron preload
        const status = await window.electron?.ipcRenderer?.invoke('get-network-info');
        setIsConnected(status?.isConnected ?? false);
      } catch (error) {
        console.error('خطأ في فحص الاتصال:', error);
        setIsConnected(false);
      }
    };

    // فحص أولي
    checkConnection();

    // تحديث دوري
    const interval = setInterval(checkConnection, 5000);

    return () => clearInterval(interval);
  }, []);

  // محاولة إعادة الاتصال
  const handleReconnect = async () => {
    if (reconnecting) return;

    setReconnecting(true);

    try {
      // محاولة إعادة الاتصال
      // @ts-expect-error: custom electron preload
      const status = await window.electron?.ipcRenderer?.invoke('connect-to-websocket-server');
      setIsConnected(status?.success ?? false);
    } catch (error) {
      console.error('فشل إعادة الاتصال:', error);
    } finally {
      setReconnecting(false);
    }
  };

  if (compact) {
    return (
      <motion.div
        className={`px-3 py-2 rounded-xl backdrop-blur-sm ${
          isConnected
            ? 'bg-green-500/30 border border-green-500/40'
            : 'bg-red-500/30 border border-red-500/40'
        }`}
        whileHover={{ scale: 1.05 }}
        animate={{
          boxShadow: isConnected
            ? ['0 0 0 rgba(16, 185, 129, 0)', '0 0 12px rgba(16, 185, 129, 0.6)', '0 0 0 rgba(16, 185, 129, 0)']
            : ['0 0 0 rgba(239, 68, 68, 0)', '0 0 12px rgba(239, 68, 68, 0.6)', '0 0 0 rgba(239, 68, 68, 0)']
        }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        {isConnected ? (
          <Wifi size={18} />
        ) : (
          <motion.div
            whileTap={{ scale: 0.95 }}
            onClick={handleReconnect}
            className="cursor-pointer"
          >
            {reconnecting ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <RefreshCw size={18} />
              </motion.div>
            ) : (
              <WifiOff size={18} />
            )}
          </motion.div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`flex items-center gap-2 px-4 py-2 rounded-xl backdrop-blur-sm ${
        isConnected
          ? 'bg-green-500/30 border border-green-500/40 text-green-100'
          : 'bg-red-500/30 border border-red-500/40 text-red-100'
      }`}
      whileHover={{ scale: 1.03 }}
      animate={{
        boxShadow: isConnected
          ? ['0 0 0 rgba(16, 185, 129, 0)', '0 0 12px rgba(16, 185, 129, 0.6)', '0 0 0 rgba(16, 185, 129, 0)']
          : ['0 0 0 rgba(239, 68, 68, 0)', '0 0 12px rgba(239, 68, 68, 0.6)', '0 0 0 rgba(239, 68, 68, 0)']
      }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      {isConnected ? (
        <>
          <Wifi size={18} />
          <span className="font-medium">متصل</span>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <WifiOff size={18} />
          <span className="font-medium">غير متصل</span>
          <motion.button
            onClick={handleReconnect}
            className={`mr-2 bg-red-600/50 hover:bg-red-600/70 px-3 py-1 rounded-lg text-sm font-bold flex items-center gap-1`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={reconnecting}
          >
            {reconnecting ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <RefreshCw size={14} />
                </motion.div>
                <span>جاري المحاولة</span>
              </>
            ) : (
              <span>إعادة الاتصال</span>
            )}
          </motion.button>
        </div>
      )}
    </motion.div>
  );
};

export default ConnectionStatus;
