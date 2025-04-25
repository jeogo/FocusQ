import React from 'react';
import { useQueue } from '../context/QueueContext';

interface ConnectionStatusProps {
  compact?: boolean;
  className?: string;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ compact = false, className = '' }) => {
  const { connectionStatus, isConnected, reconnectServer, switchToOfflineMode, switchToOnlineMode } = useQueue();
  
  // Format the last connected time
  const formatTime = (date: Date | null) => {
    if (!date) return 'Never';
    return date.toLocaleTimeString();
  };
  
  // Determine the status dot color
  const getStatusColor = () => {
    switch (connectionStatus.status) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'disconnected':
        return 'bg-red-500';
      case 'error':
        return 'bg-red-600';
      default:
        return 'bg-gray-500';
    }
  };
  
  // Determine the status text
  const getStatusText = () => {
    switch (connectionStatus.status) {
      case 'connected':
        return 'متصل';
      case 'connecting':
        return 'جاري الاتصال...';
      case 'disconnected':
        return 'غير متصل';
      case 'error':
        return 'خطأ في الاتصال';
      default:
        return 'غير معروف';
    }
  };
  
  if (compact) {
    // Compact view just shows a dot and status
    return (
      <div className={`flex items-center ${className}`}>
        <div className={`w-2 h-2 rounded-full ${getStatusColor()} mr-1.5`}></div>
        <span className="text-xs text-gray-600">
          {getStatusText()}
        </span>
      </div>
    );
  }
  
  // Full view with actions
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-3 ${className}`} dir="rtl">
      <div className="flex items-center mb-2">
        <div className={`w-3 h-3 rounded-full ${getStatusColor()} mr-2`}></div>
        <h3 className="font-medium text-gray-700">حالة الاتصال: {getStatusText()}</h3>
      </div>
      
      {connectionStatus.lastConnected && (
        <p className="text-xs text-gray-500 mb-2">
          آخر اتصال: {formatTime(connectionStatus.lastConnected)}
        </p>
      )}
      
      {connectionStatus.lastError && (
        <p className="text-xs text-red-500 mb-2">
          خطأ: {connectionStatus.lastError.message}
        </p>
      )}
      
      <div className="flex flex-wrap gap-2 mt-2">
        {connectionStatus.status !== 'connected' && (
          <button
            onClick={() => reconnectServer()}
            className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
          >
            إعادة الاتصال
          </button>
        )}
        
        {isConnected ? (
          <button
            onClick={() => switchToOfflineMode()}
            className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition-colors"
          >
            وضع عدم الاتصال
          </button>
        ) : (
          <button
            onClick={() => switchToOnlineMode()}
            className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 transition-colors"
          >
            وضع الاتصال
          </button>
        )}
      </div>
    </div>
  );
};

export default ConnectionStatus;
