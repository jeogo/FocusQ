import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ticket } from '../../types';
import { Clock, User } from 'lucide-react';

interface WaitingListProps {
  tickets: Ticket[];
  isDarkMode?: boolean;
}

export const WaitingList: React.FC<WaitingListProps> = ({
  tickets,
  isDarkMode = true
}) => {
  // عرض التذاكر المنتظرة مرتبة حسب رقم التذكرة (الأقدم أولاً)
  const sortedTickets = [...tickets].sort((a, b) => a.id - b.id);

  // تحويل الوقت من ميللي ثانية إلى دقائق
  const calculateWaitingTime = (timestamp: number): number => {
    const now = Date.now();
    const diffMs = now - timestamp;
    return Math.floor(diffMs / (1000 * 60)); // بالدقائق
  };

  return (
    <div className="flex max-h-[calc(100%-40px)] flex-col overflow-y-auto p-2">
      <AnimatePresence>
        {sortedTickets.length > 0 ? (
          <div className={`grid grid-cols-1 gap-2`}>
            {sortedTickets.map((ticket, index) => {
              const waitingTime = calculateWaitingTime(ticket.timestamp);

              return (
                <motion.div
                  key={ticket.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className={`flex items-center justify-between rounded-lg p-2 ${
                    isDarkMode
                      ? 'bg-gray-700 hover:bg-gray-600'
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex items-center">
                    <span className={`ml-2 flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold ${
                      isDarkMode ? 'bg-amber-700 text-white' : 'bg-amber-500 text-white'
                    }`}>
                      {index + 1}
                    </span>
                    <div>
                      <div className="font-medium">تذكرة {ticket.id}</div>
                      <div className="text-xs text-gray-400">{ticket.serviceType}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className={`flex items-center rounded-full px-2 py-1 text-xs ${
                      isDarkMode ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-700'
                    }`}>
                      <User size={12} className="mr-1" />
                      <span>#{ticket.id}</span>
                    </div>

                    <div className={`flex items-center rounded-full px-2 py-1 text-xs ${
                      waitingTime > 15
                        ? isDarkMode ? 'bg-red-900/40 text-red-300' : 'bg-red-100 text-red-700'
                        : isDarkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700'
                    }`}>
                      <Clock size={12} className="mr-1" />
                      <span>
                        {waitingTime < 1
                          ? 'الآن'
                          : `${waitingTime} ${waitingTime === 1 ? 'دقيقة' : 'دقائق'}`}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-full items-center justify-center p-4 text-gray-400"
          >
            <div className="text-center">
              <div className="text-xl">لا توجد تذاكر في الانتظار</div>
              <div className="mt-2 text-sm">جميع العملاء تتم خدمتهم حاليًا</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
