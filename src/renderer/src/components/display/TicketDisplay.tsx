import React from 'react';
import { motion } from 'framer-motion';
import { Ticket, Counter } from '../../types';

interface TicketDisplayProps {
  ticket: Ticket;
  counter: Counter | undefined;
  isHighlighted?: boolean;
  isDarkMode?: boolean;
}

export const TicketDisplay: React.FC<TicketDisplayProps> = ({
  ticket,
  counter,
  isHighlighted = false,
  isDarkMode = true
}) => {
  return (
    <div className="flex w-full flex-col text-center">
      <motion.div
        initial={isHighlighted ? { scale: 1.1 } : { scale: 1 }}
        animate={isHighlighted ? { scale: 1.1 } : { scale: 1 }}
        className={`mb-2 rounded-lg px-6 py-3 text-white ${
          isHighlighted ? 'bg-yellow-600' : 'bg-blue-600'
        }`}
      >
        <span className="block text-4xl font-bold">{ticket.id}</span>
        <span className="mt-1 block text-lg">رقم التذكرة</span>
      </motion.div>

      <motion.div
        initial={isHighlighted ? { scale: 1.1 } : { scale: 1 }}
        animate={isHighlighted ? { scale: 1.1 } : { scale: 1 }}
        className={`rounded-lg px-6 py-3 text-white ${
          isHighlighted ? 'bg-green-600' : 'bg-green-700'
        }`}
      >
        <span className="block text-4xl font-bold">{ticket.counterNumber || '-'}</span>
        <span className="mt-1 block text-lg">رقم المكتب</span>
      </motion.div>

      <div className={`mt-2 rounded p-2 ${
        isDarkMode ? 'bg-gray-700' : 'bg-gray-200 text-gray-800'
      }`}>
        <span className="font-semibold">نوع الخدمة:</span>{' '}
        <span>{ticket.serviceType}</span>
      </div>

      {counter && counter.status !== 'active' && (
        <div className="mt-2 rounded bg-red-900 p-1 text-sm text-white">
          {counter.status === 'break' ? 'المكتب في استراحة' : 'المكتب غير متاح'}
        </div>
      )}
    </div>
  );
};
