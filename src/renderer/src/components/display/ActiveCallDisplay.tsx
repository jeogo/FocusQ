import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Ticket, Counter } from '../../types';
import { ArrowBigRight, Check, Clock } from 'lucide-react';

interface ActiveCallDisplayProps {
  ticket: Ticket;
  counter: Counter | undefined;
  isDarkMode: boolean;
}

export const ActiveCallDisplay: React.FC<ActiveCallDisplayProps> = ({
  ticket,
  counter,
  isDarkMode
}) => {
  // إضافة عداد تنازلي للتأثير البصري
  const [countdown, setCountdown] = useState<number>(10);

  useEffect(() => {
    // إعادة ضبط العداد عند تغيير التذكرة
    setCountdown(10);

    // عداد تنازلي من 10 إلى 0 لإظهار أن التذكرة مستدعاة
    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [ticket.id]); // إعادة ضبط العداد عند تغيير التذكرة

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`flex h-full flex-col items-center justify-center rounded-lg ${
        isDarkMode ? 'bg-blue-900/60' : 'bg-blue-100'
      }`}
    >
      <div className={`absolute left-4 top-4 flex items-center rounded-full ${
        isDarkMode ? 'bg-red-600' : 'bg-red-500'
      } px-4 py-2 text-white`}>
        <Clock size={18} className="mr-2 animate-pulse" />
        <span>الرجاء التوجه إلى</span>
      </div>

      <div className="flex w-full flex-col items-center px-8 py-6">
        <div className="flex w-full items-center justify-between">
          {/* رقم التذكرة */}
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className={`flex flex-col items-center rounded-2xl px-12 py-6 ${
              isDarkMode ? 'bg-blue-800 text-white shadow-xl shadow-blue-900/30' : 'bg-blue-200 text-blue-900 shadow-lg'
            }`}
          >
            <span className="mb-2 text-xl font-bold">رقم التذكرة</span>
            <span className="text-8xl font-bold">{ticket.id}</span>
            <span className="mt-3 rounded-full bg-blue-700 bg-opacity-20 px-4 py-1 text-lg">
              {ticket.serviceType}
            </span>
          </motion.div>

          {/* سهم يشير لليمين */}
          <ArrowBigRight
            className={`mx-8 animate-pulse ${
              isDarkMode ? 'text-yellow-400' : 'text-blue-600'
            }`}
            size={100}
          />

          {/* رقم المكتب */}
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1, repeat: Infinity, delay: 0.3 }}
            className={`flex flex-col items-center rounded-2xl px-12 py-6 ${
              isDarkMode ? 'bg-green-800 text-white shadow-xl shadow-green-900/30' : 'bg-green-200 text-green-900 shadow-lg'
            }`}
          >
            <span className="mb-2 text-xl font-bold">مكتب رقم</span>
            <span className="text-8xl font-bold">{ticket.counterNumber}</span>
            <span className="mt-3 flex items-center gap-2 rounded-full bg-green-700 bg-opacity-20 px-4 py-1 text-lg">
              {counter?.status === 'active' ? (
                <>
                  <Check size={18} className="text-green-400" />
                  <span>جاهز للخدمة</span>
                </>
              ) : (
                <span>
                  {counter?.status === 'break' ? 'في استراحة' : counter?.status === 'inactive' ? 'غير متاح' : 'متاح'}
                </span>
              )}
            </span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className={`mt-8 rounded-lg px-16 py-4 text-center text-2xl font-bold ${
            isDarkMode
              ? 'bg-yellow-600 bg-opacity-80 text-white'
              : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          نداء للعميل صاحب التذكرة رقم {ticket.id}
        </motion.div>
      </div>

      {/* مؤشر العد التنازلي في الأسفل */}
      <div className={`absolute bottom-4 left-1/2 flex h-2 w-3/4 -translate-x-1/2 overflow-hidden rounded-full ${
        isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
      }`}>
        <motion.div
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: 10, ease: 'linear' }}
          className={`h-full ${isDarkMode ? 'bg-yellow-500' : 'bg-amber-500'}`}
        />
      </div>

      {/* عرض العداد التنازلي الرقمي */}
      <div className="absolute bottom-4 right-4 rounded-full bg-gray-800 bg-opacity-60 px-3 py-1 text-sm text-white">
        {countdown} ثانية
      </div>
    </motion.div>
  );
};
