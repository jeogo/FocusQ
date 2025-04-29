import { useQueue } from '../context/QueueContext'
import { useEffect, useRef, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ConnectionStatus from '../components/ConnectionStatus'
import { playTicketAnnouncement } from '@renderer/utils/audioUtils';
import Logo from '../components/Logo';
import { formatUtils } from '../services/QueueService';

interface DisplayScreenProps {
  displayId?: number;
}

export default function DisplayScreen({ displayId = 1 }: DisplayScreenProps) {
  const { queueState, isLoading, error, socket } = useQueue();
  const [currentAnnouncement, setCurrentAnnouncement] = useState<any>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const announcementQueue = useRef<any[]>([]);
  const isAnnouncing = useRef(false);

  // تحديث الوقت كل ثانية
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // استخراج التذاكر قيد الخدمة
  const servingTickets = useMemo(() =>
    queueState?.tickets?.filter(t => t.status === 'serving') || []
  , [queueState?.tickets]);

  // التذكرة المناداة عليها حالياً (الأحدث)
  const currentTicket = useMemo(() => {
    return servingTickets.length > 0 ? servingTickets[0] : null;
  }, [servingTickets]);

  // التذاكر قيد الخدمة الأخرى (عدا الحالية)
  const otherServingTickets = useMemo(() => {
    return servingTickets.slice(1);
  }, [servingTickets]);

  // التذاكر في الانتظار
  const waitingTickets = useMemo(() =>
    queueState?.tickets?.filter(t => t.status === 'waiting') || []
  , [queueState?.tickets]);

  // التذاكر المخدومة حديثًا
  const recentlyServed = useMemo(() =>
    queueState?.tickets?.filter(t => t.status === 'complete')
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5) || []
  , [queueState?.tickets]);

  // معالجة قائمة الإعلانات بالتسلسل
  const processAnnouncementQueue = async () => {
    if (isAnnouncing.current || announcementQueue.current.length === 0) return;
    isAnnouncing.current = true;

    const data = announcementQueue.current.shift();
    setCurrentAnnouncement(data);
    setShowNotification(true);

    // تشغيل صوت الإعلان
    if (typeof playTicketAnnouncement === 'function') {
      await playTicketAnnouncement(data.ticket.id, data.counterId);
    } else {
      try {
        const audio = new Audio('/sounds/notification.mp3');
        await audio.play();
      } catch (err) {
        // ignore
      }
    }

    // استخدم مدة الإعلان أو الافتراضية
    const duration = data.announcementDuration || 7000;
    await new Promise(res => setTimeout(res, duration));

    setShowNotification(false);
    setCurrentAnnouncement(null);
    isAnnouncing.current = false;

    // تابع معالجة العنصر التالي إن وجد
    if (announcementQueue.current.length > 0) {
      processAnnouncementQueue();
    }
  };

  // استقبال أحداث ticketCalled وإضافتها للطابور
  useEffect(() => {
    if (!socket) return;
    const handleTicketCalled = (data: {
      ticket: any,
      counterId: number,
      timestamp: number,
      announcementDuration?: number
    }) => {
      announcementQueue.current.push(data);
      processAnnouncementQueue();
    };
    socket.on('ticketCalled', handleTicketCalled);
    return () => {
      socket.off('ticketCalled', handleTicketCalled);
    };
  }, [socket]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <motion.div
          className="bg-white p-8 rounded-3xl shadow-lg text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Logo className="mx-auto mb-6 w-32 h-32" />
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute top-0 left-0 w-full h-full border-8 border-gray-200 rounded-full"></div>
            <motion.div
              className="absolute top-0 left-0 w-full h-full border-8 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
          </div>
          <p className="text-3xl font-bold text-gray-800">جاري تحميل البيانات...</p>
          <p className="mt-2 text-gray-500">يرجى الانتظار</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid place-items-center h-screen bg-white p-8">
        <motion.div
          className="bg-white p-8 rounded-3xl shadow-lg text-center max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Logo className="mx-auto mb-6 w-24 h-24" />
          <div className="text-5xl mb-4 text-red-500">⚠️</div>
          <p className="text-2xl font-bold text-gray-800 mb-4">حدث خطأ في الاتصال</p>
          <p className="text-xl text-gray-600 mb-6">{error.toString()}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1 text-xl font-bold"
          >
            إعادة المحاولة
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-800 overflow-hidden" dir="rtl">
      {/* رأس الصفحة مع معلومات الشاشة والوقت والشعار */}
      <header className="p-6 flex justify-between items-center border-b border-gray-100 bg-white shadow-sm">
        <div className="flex items-center">
          <Logo className="h-12 w-12 mr-4" />
          <motion.div
            className="bg-white p-3 rounded-2xl mr-4 shadow-sm border border-gray-100"
            whileHover={{ scale: 1.05 }}
          >
            <h1 className="text-2xl font-bold text-gray-700">شاشة العرض {displayId}</h1>
          </motion.div>
          <ConnectionStatus />
        </div>

        <motion.div
          className="bg-white p-3 rounded-2xl shadow-sm border border-gray-200 text-center"
          animate={{
            boxShadow: ['0 4px 6px rgba(0, 0, 0, 0.1)', '0 6px 8px rgba(0, 0, 0, 0.15)', '0 4px 6px rgba(0, 0, 0, 0.1)']
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="text-3xl font-mono text-gray-700">
            {formatUtils.formatTime(currentTime)}
          </div>
          <div className="text-sm text-gray-500">
            {formatUtils.formatDate(currentTime)}
          </div>
        </motion.div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* منطقة التذكرة المناداة عليها */}
        <div className="mb-8">
          <AnimatePresence mode="wait">
            {showNotification && currentAnnouncement ? (
              <motion.div
                key={`current-${currentAnnouncement.ticket.id}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.5 }}
                className="relative rounded-3xl overflow-hidden border border-gray-200 shadow-lg bg-white"
              >
                {/* شريط مميز أعلى البطاقة */}
                <div className="h-2 bg-gradient-to-r from-blue-500 to-blue-600"></div>

                <div className="relative p-12 flex flex-col items-center justify-center">
                  <div className="text-center mb-6">
                    <motion.div
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-3xl font-bold text-gray-800 mb-4"
                    >
                      نداء للعميل صاحب التذكرة
                    </motion.div>

                    <div className="flex items-center justify-center gap-12 mb-8">
                      {/* رقم التذكرة */}
                      <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                        className="text-center"
                      >
                        <div className="text-2xl font-bold text-gray-500 mb-2">رقم التذكرة</div>
                        <motion.div
                          className="bg-blue-50 text-9xl font-bold text-blue-600 py-8 px-12 rounded-2xl border-4 border-blue-100 shadow-lg"
                          animate={{
                            scale: [1, 1.05, 1],
                            boxShadow: [
                              '0 10px 25px -5px rgba(59, 130, 246, 0.1)',
                              '0 10px 25px -5px rgba(59, 130, 246, 0.3)',
                              '0 10px 25px -5px rgba(59, 130, 246, 0.1)'
                            ]
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          {currentAnnouncement.ticket.id}
                        </motion.div>
                      </motion.div>

                      {/* رمز السهم */}
                      <motion.div
                        animate={{
                          x: [0, 10, 0],
                          scale: [1, 1.1, 1]
                        }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="text-7xl font-bold text-gray-400"
                      >
                        ←
                      </motion.div>

                      {/* رقم المكتب */}
                      <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                        className="text-center"
                      >
                        <div className="text-2xl font-bold text-gray-500 mb-2">المكتب رقم</div>
                        <motion.div
                          className="bg-green-50 text-9xl font-bold text-green-600 py-8 px-12 rounded-2xl border-4 border-green-100 shadow-lg"
                          animate={{
                            scale: [1, 1.05, 1],
                            boxShadow: [
                              '0 10px 25px -5px rgba(16, 185, 129, 0.1)',
                              '0 10px 25px -5px rgba(16, 185, 129, 0.3)',
                              '0 10px 25px -5px rgba(16, 185, 129, 0.1)'
                            ]
                          }}
                          transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                        >
                          {currentAnnouncement.ticket.counterNumber}
                        </motion.div>
                      </motion.div>
                    </div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 }}
                      className="mt-4 bg-gray-100 py-3 px-8 rounded-xl text-xl font-bold inline-block text-gray-700"
                    >
                      {currentAnnouncement.ticket.serviceType || 'خدمة عامة'}
                    </motion.div>
                  </div>

                  {/* شريط العد التنازلي */}
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-2 bg-blue-500"
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: 7, ease: 'linear' }}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white p-12 rounded-3xl border border-gray-200 shadow-md flex flex-col items-center justify-center min-h-[400px]"
              >
                <Logo className="h-24 w-24 mb-8 opacity-50" />
                <div className="text-4xl font-bold text-gray-700 mb-4">في انتظار النداء التالي</div>
                <div className="text-xl text-gray-500">
                  {waitingTickets.length > 0
                    ? `${waitingTickets.length} تذكرة في قائمة الانتظار`
                    : 'لا توجد تذاكر في الانتظار حالياً'}
                </div>

                <motion.div
                  className="w-24 h-1 bg-gray-200 mt-8 rounded-full"
                  animate={{
                    width: ['6rem', '12rem', '6rem'],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* منطقة عرض معلومات الطابور - مقسمة لثلاثة أقسام */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* القسم الأول: التذاكر قيد الخدمة */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-blue-50 py-3 px-4 text-xl font-bold text-blue-700 border-b border-blue-100">
              <div className="flex items-center justify-between">
                <span>تذاكر قيد الخدمة</span>
                <span className="bg-blue-100 text-blue-700 py-1 px-3 rounded-lg text-sm">{otherServingTickets.length}</span>
              </div>
            </div>

            <div className="p-4 max-h-[350px] overflow-y-auto">
              {otherServingTickets.length > 0 ? (
                <div className="space-y-3">
                  {otherServingTickets.map(ticket => (
                    <motion.div
                      key={ticket.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center hover:border-blue-200 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-100 text-blue-700 h-12 w-12 rounded-full flex items-center justify-center text-xl font-bold">
                          {ticket.id}
                        </div>
                        <div className="text-sm text-gray-700">
                          <div>{ticket.serviceType || 'خدمة عامة'}</div>
                        </div>
                      </div>
                      <div className="bg-gray-100 py-1 px-3 rounded-lg text-sm text-gray-700">
                        مكتب {ticket.counterNumber}
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-gray-400">
                  لا توجد تذاكر قيد الخدمة حالياً
                </div>
              )}
            </div>
          </div>

          {/* القسم الثاني: قائمة الانتظار */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-green-50 py-3 px-4 text-xl font-bold text-green-700 border-b border-green-100">
              <div className="flex items-center justify-between">
                <span>قائمة الانتظار</span>
                <span className="bg-green-100 text-green-700 py-1 px-3 rounded-lg text-sm">{waitingTickets.length}</span>
              </div>
            </div>

            <div className="p-4 max-h-[350px] overflow-y-auto">
              {waitingTickets.length > 0 ? (
                <div className="space-y-3">
                  {waitingTickets.slice(0, 8).map((ticket, index) => (
                    <motion.div
                      key={ticket.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-white p-3 rounded-xl border border-gray-200 flex justify-between items-center hover:border-green-200 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-green-100 text-green-700 h-10 w-10 rounded-full flex items-center justify-center text-lg font-bold">
                          {index + 1}
                        </div>
                        <div className="text-xl font-bold text-gray-700">
                          {ticket.id}
                        </div>
                      </div>
                      <div className="bg-gray-100 py-1 px-2 rounded-lg text-xs text-gray-700">
                        {ticket.serviceType || 'خدمة عامة'}
                      </div>
                    </motion.div>
                  ))}

                  {waitingTickets.length > 8 && (
                    <div className="text-center text-gray-500 py-2">
                      +{waitingTickets.length - 8} تذكرة إضافية في الانتظار
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-gray-400">
                  لا توجد تذاكر في الانتظار حالياً
                </div>
              )}
            </div>
          </div>

          {/* القسم الثالث: التذاكر المخدومة حديثًا */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-purple-50 py-3 px-4 text-xl font-bold text-purple-700 border-b border-purple-100">
              <div className="flex items-center justify-between">
                <span>آخر التذاكر المخدومة</span>
                <span className="bg-purple-100 text-purple-700 py-1 px-3 rounded-lg text-sm">{recentlyServed.length}</span>
              </div>
            </div>

            <div className="p-4 max-h-[350px] overflow-y-auto">
              {recentlyServed.length > 0 ? (
                <div className="space-y-3">
                  {recentlyServed.map((ticket, index) => (
                    <motion.div
                      key={ticket.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-white p-3 rounded-xl border border-gray-200 flex justify-between items-center hover:border-purple-200 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-purple-100 text-purple-700 h-10 w-10 rounded-full flex items-center justify-center text-lg font-bold">
                          {ticket.id}
                        </div>
                        <div className="text-sm text-gray-700">
                          <div>{ticket.serviceType || 'خدمة عامة'}</div>
                          <div className="text-xs text-gray-500">
                            {formatUtils.formatTime(new Date(ticket.timestamp))}
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-100 py-1 px-3 rounded-lg text-sm text-gray-700">
                        مكتب {ticket.counterNumber}
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-gray-400">
                  لا توجد تذاكر مخدومة حديثًا
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* تذييل الصفحة مع معلومات إضافية */}
      <footer className="fixed bottom-0 left-0 right-0 p-3 bg-white border-t border-gray-200 text-center text-gray-500 text-sm">
        آخر تحديث: {formatUtils.formatTime(new Date())} | إجمالي التذاكر: {formatUtils.formatNumber(queueState?.tickets?.length || 0)} | المكاتب النشطة: {formatUtils.formatNumber(queueState?.counters?.filter(c => c.status === 'active').length || 0)}
      </footer>
    </div>
  );
}
