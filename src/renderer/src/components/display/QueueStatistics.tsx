import React, { useMemo } from 'react';
import { Clock, Users, CheckCircle, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Ticket } from '../../types';

interface QueueStatisticsProps {
  tickets: Ticket[];
  refreshTime: Date | null;
}

export const QueueStatistics: React.FC<QueueStatisticsProps> = ({
  tickets,
  refreshTime
}) => {
  // احتساب الإحصائيات
  const stats = useMemo(() => {
    const waitingCount = tickets.filter(t => t.status === 'waiting').length;
    const servingCount = tickets.filter(t => t.status === 'serving').length;
    const completedCount = tickets.filter(t => t.status === 'complete').length;

    // حساب متوسط وقت الانتظار (بالدقائق)
    const now = Date.now();
    const waitingTimes: number[] = [];

    // جمع أوقات الانتظار من التذاكر التي تم خدمتها
    tickets.forEach(ticket => {
      if (ticket.status === 'serving' || ticket.status === 'complete') {
        // وقت الانتظار هو الوقت بين إنشاء التذكرة وبدء الخدمة
        const waitTime = Math.floor((now - ticket.timestamp) / (1000 * 60));
        waitingTimes.push(waitTime);
      }
    });

    // حساب المتوسط إذا كانت هناك بيانات
    const avgWaitTime = waitingTimes.length > 0
      ? waitingTimes.reduce((sum, time) => sum + time, 0) / waitingTimes.length
      : 0;

    // حساب متوسط وقت الانتظار المتوقع (إذا كانت هناك تذاكر في الانتظار)
    const estimatedWaitTime = waitingCount > 0 && avgWaitTime > 0
      ? avgWaitTime * (waitingCount / Math.max(servingCount, 1))
      : 0;

    return {
      waiting: waitingCount,
      serving: servingCount,
      completed: completedCount,
      total: tickets.length,
      avgWaitTime: Math.round(avgWaitTime),
      estimatedWaitTime: Math.round(estimatedWaitTime)
    };
  }, [tickets]);

  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <h2 className="mb-3 text-center text-lg font-bold text-blue-300">إحصائيات الطابور</h2>

      <div className="grid grid-cols-2 gap-3">
        <motion.div
          whileHover={{ scale: 1.03 }}
          className="flex items-center gap-2 rounded-md bg-blue-900/50 p-3"
        >
          <Users className="text-blue-300" size={20} />
          <div>
            <div className="text-sm text-blue-300">في الانتظار</div>
            <div className="text-xl font-bold">{stats.waiting}</div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.03 }}
          className="flex items-center gap-2 rounded-md bg-green-900/50 p-3"
        >
          <CheckCircle className="text-green-300" size={20} />
          <div>
            <div className="text-sm text-green-300">تمت الخدمة</div>
            <div className="text-xl font-bold">{stats.completed}</div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.03 }}
          className="flex items-center gap-2 rounded-md bg-amber-900/50 p-3"
        >
          <Clock className="text-amber-300" size={20} />
          <div>
            <div className="text-sm text-amber-300">متوسط الانتظار</div>
            <div className="text-xl font-bold">
              {stats.avgWaitTime > 0 ? `${stats.avgWaitTime} دقيقة` : 'لا يوجد'}
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.03 }}
          className="flex items-center gap-2 rounded-md bg-purple-900/50 p-3"
        >
          <AlertCircle className="text-purple-300" size={20} />
          <div>
            <div className="text-sm text-purple-300">الانتظار المتوقع</div>
            <div className="text-xl font-bold">
              {stats.estimatedWaitTime > 0
                ? `~${stats.estimatedWaitTime} دقيقة`
                : 'لا يوجد'}
            </div>
          </div>
        </motion.div>
      </div>

      {refreshTime && (
        <div className="mt-3 text-center text-xs text-gray-400">
          آخر تحديث: {refreshTime.toLocaleTimeString('ar-SA')}
        </div>
      )}
    </div>
  );
};
