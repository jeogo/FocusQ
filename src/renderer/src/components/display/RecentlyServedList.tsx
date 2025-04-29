import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ticket } from '../../types';
import { Check, Clock } from 'lucide-react';

interface RecentlyServedListProps {
  tickets: Ticket[];
  isDarkMode?: boolean;
}

export const RecentlyServedList: React.FC<RecentlyServedListProps> = ({
  tickets,
  isDarkMode = true
}) => {
  // تحويل الوقت من ميللي ثانية إلى صيغة مناسبة
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="max-h-[140px] overflow-y-auto p-2">
      <AnimatePresence>
        {tickets.length > 0 ? (
          <div className="grid grid-cols-1 gap-1">
            {tickets.map((ticket) => (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className={`flex items-center justify-between rounded p-2 text-sm ${
                  isDarkMode ? 'bg-gray-700' : 'bg-gray-200 text-gray-800'
                }`}
              >
                <div className="flex items-center">
                  <Check size={16} className={`mr-1 ${
                    isDarkMode ? 'text-green-400' : 'text-green-600'
                  }`} />
                  <span className="font-semibold">تذكرة {ticket.id}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={isDarkMode ? 'text-green-400' : 'text-green-700'}>
                    مكتب {ticket.counterNumber}
                  </span>

                  <div className={`flex items-center rounded-full px-2 py-1 text-xs ${
                    isDarkMode ? 'bg-gray-600 text-gray-300' : 'bg-gray-300 text-gray-700'
                  }`}>
                    <Clock size={10} className="mr-1" />
                    <span>{formatTime(ticket.timestamp)}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-[100px] items-center justify-center text-gray-400"
          >
            لم يتم خدمة أي تذاكر حتى الآن
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
