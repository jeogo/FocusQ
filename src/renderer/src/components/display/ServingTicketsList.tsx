import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ticket, Counter } from '../../types';
import { Clock, CheckCircle2 } from 'lucide-react';

interface ServingTicketsListProps {
  tickets: Ticket[];
  counters: Counter[];
  isDarkMode: boolean;
  highlightedTicketId?: number | null;
}

export const ServingTicketsList: React.FC<ServingTicketsListProps> = ({
  tickets,
  counters,
  isDarkMode,
  highlightedTicketId
}) => {
  // ترتيب التذاكر قيد الخدمة حسب المكتب
  const sortedTickets = [...tickets].sort((a, b) => {
    // التذكرة المميزة في المقدمة دائمًا
    if (a.id === highlightedTicketId) return -1;
    if (b.id === highlightedTicketId) return 1;

    // ثم المكاتب الأصغر رقمًا
    return (a.counterNumber || 0) - (b.counterNumber || 0);
  });

  return (
    <div className="flex max-h-full flex-col overflow-y-auto p-2">
      <AnimatePresence>
        {sortedTickets.length > 0 ? (
          <div className="grid grid-cols-1 gap-2">
            {sortedTickets.map((ticket) => {
              const isHighlighted = ticket.id === highlightedTicketId;
              const counter = counters.find(c => c.id === ticket.counterNumber);

              return (
                <motion.div
                  key={ticket.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: isHighlighted ? [1, 1.02, 1] : 1
                  }}
                  transition={{
                    duration: 0.3,
                    scale: {
                      repeat: isHighlighted ? Infinity : 0,
                      duration: 2
                    }
                  }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`flex items-center justify-between rounded-lg p-3 ${
                    isHighlighted
                      ? isDarkMode ? 'bg-amber-700/80 border border-amber-500' : 'bg-amber-100 border border-amber-400'
                      : isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ${
                      isHighlighted
                        ? isDarkMode ? 'bg-amber-600 text-white' : 'bg-amber-500 text-white'
                        : isDarkMode ? 'bg-blue-700 text-white' : 'bg-blue-500 text-white'
                    }`}>
                      {ticket.id}
                    </div>
                    <div>
                      <div className="font-medium">تذكرة {ticket.id}</div>
                      <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {ticket.serviceType}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isHighlighted && (
                      <div className={`flex items-center rounded-full px-2 py-1 text-xs ${
                        isDarkMode ? 'bg-amber-600/40 text-amber-200' : 'bg-amber-500/20 text-amber-800'
                      }`}>
                        <Clock size={12} className="mr-1" />
                        <span>تمت المناداة</span>
                      </div>
                    )}

                    <div className={`rounded-lg px-3 py-1 text-center ${
                      counter?.status === 'active'
                        ? isDarkMode ? 'bg-green-800/80 text-white' : 'bg-green-100 text-green-800'
                        : isDarkMode ? 'bg-red-800/80 text-white' : 'bg-red-100 text-red-800'
                    }`}>
                      <div className="font-medium">مكتب {ticket.counterNumber}</div>
                      <div className="text-xs flex items-center justify-center gap-1">
                        {counter?.status === 'active'
                          ? (
                            <>
                              <CheckCircle2 size={12} />
                              <span>نشط</span>
                            </>
                          )
                          : counter?.status === 'break'
                            ? 'استراحة'
                            : 'غير متاح'}
                      </div>
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
              <div className="mb-2 text-xl">لا توجد تذاكر قيد الخدمة حاليًا</div>
              <div className="text-sm">ستظهر التذاكر هنا بعد مناداة العملاء</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
