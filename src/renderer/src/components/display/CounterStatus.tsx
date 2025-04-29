import React from 'react';
import { Counter, Ticket } from '../../types';
import { User, Clock, Coffee, XCircle } from 'lucide-react';

interface CounterStatusProps {
  counter: Counter;
  currentTicket: Ticket | undefined;
  isDarkMode?: boolean;
}

export const CounterStatus: React.FC<CounterStatusProps> = ({
  counter,
  currentTicket,
  isDarkMode = true
}) => {
  // تحديد أيقونة حالة المكتب
  const getStatusIcon = () => {
    switch (counter.status) {
      case 'active':
        return counter.busy
          ? <User size={14} className="text-yellow-400" />
          : <User size={14} className="text-green-400" />;
      case 'break':
        return <Coffee size={14} className="text-yellow-400" />;
      default:
        return <XCircle size={14} className="text-red-400" />;
    }
  };

  // تحديد نص حالة المكتب
  const getStatusText = () => {
    if (counter.status !== 'active') {
      return counter.status === 'break' ? 'في استراحة' : 'غير متاح';
    }
    return counter.busy ? 'مشغول' : 'متاح';
  };

  return (
    <div className={`rounded-lg p-3 ${
      counter.busy
        ? isDarkMode ? 'bg-red-900/70' : 'bg-red-100 text-red-800'
        : isDarkMode ? 'bg-green-900/70' : 'bg-green-100 text-green-800'
    }`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xl font-bold">مكتب {counter.id}</span>
        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${
          counter.status === 'active'
            ? counter.busy
              ? isDarkMode ? 'bg-yellow-900' : 'bg-yellow-200'
              : isDarkMode ? 'bg-green-800' : 'bg-green-200'
            : counter.status === 'break'
              ? isDarkMode ? 'bg-yellow-900' : 'bg-yellow-200'
              : isDarkMode ? 'bg-red-900' : 'bg-red-200'
        }`}>
          {getStatusIcon()}
        </span>
      </div>

      <div className="text-sm">
        {counter.busy
          ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center">
                <span className="font-semibold">رقم التذكرة:</span>{' '}
                <span className={isDarkMode ? 'text-white mr-1' : 'text-red-800 font-bold mr-1'}>
                  {currentTicket?.id || counter.currentTicket}
                </span>
              </div>

              {currentTicket && (
                <div className="flex items-center text-xs">
                  <Clock size={12} className="mr-1 opacity-80" />
                  <span>{currentTicket.serviceType}</span>
                </div>
              )}
            </div>
          )
          : (
            <div className={isDarkMode ? 'text-green-300' : 'text-green-700 font-medium'}>
              {getStatusText()}
            </div>
          )
        }
      </div>
    </div>
  );
};
