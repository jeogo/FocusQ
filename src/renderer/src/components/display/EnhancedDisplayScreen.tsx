import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueueState } from '../../hooks/useQueueState';
import { Ticket } from '../../types';
import { useSound } from '../../hooks/useSound';
import { TicketDisplay } from './TicketDisplay';
import { CounterStatus } from './CounterStatus';
import { WaitingList } from './WaitingList';
import { ConnectionStatus } from '../common/ConnectionStatus';
import { RecentlyServedList } from './RecentlyServedList';
import { TicketAnnouncer } from './TicketAnnouncer';
import { QueueStatistics } from './QueueStatistics';
import { ServingTicketsList } from './ServingTicketsList';
import { ActiveCallDisplay } from './ActiveCallDisplay';
import { Sun, Moon, RotateCw, Clock } from 'lucide-react';

interface EnhancedDisplayScreenProps {
  displayId?: number;
}

export const EnhancedDisplayScreen: React.FC<EnhancedDisplayScreenProps> = ({ displayId = 1 }) => {
  const { state, isLoading, error, refetch, lastUpdated } = useQueueState();
  const [recentlyServed, setRecentlyServed] = useState<Ticket[]>([]);
  const [currentAnnouncement, setCurrentAnnouncement] = useState<Ticket | null>(null);
  const [isAnnouncing, setIsAnnouncing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastAnnouncedRef = useRef<number | null>(null);

  // إعداد هوك الصوت للإعلانات
  const { error: soundError } = useSound();

  // تتبع التذاكر المستدعاة حديثًا للإعلان عنها
  useEffect(() => {
    if (!state || isLoading) return;

    const servingTickets = state.tickets.filter(ticket =>
      ticket.status === 'serving' && ticket.counterNumber
    );

    // العثور على التذكرة المستدعاة حديثًا والتي لم يتم الإعلان عنها بعد
    const newlyCalled = servingTickets.find(ticket =>
      lastAnnouncedRef.current !== ticket.id
    );

    if (newlyCalled && !isAnnouncing) {
      // تحديث التذكرة المستدعاة حاليًا للإعلان
      setCurrentAnnouncement(newlyCalled);
      lastAnnouncedRef.current = newlyCalled.id;

      // إضافة التذكرة إلى قائمة التذاكر التي تمت خدمتها مؤخرًا
      setRecentlyServed(prev => {
        const existingIndex = prev.findIndex(t => t.id === newlyCalled.id);

        if (existingIndex >= 0) {
          // إذا كانت التذكرة موجودة بالفعل، نقوم بتحديثها
          const updated = [...prev];
          updated[existingIndex] = newlyCalled;
          return updated;
        } else {
          // إضافة التذكرة الجديدة في البداية مع الحفاظ على آخر 5 تذاكر فقط
          return [newlyCalled, ...prev].slice(0, 5);
        }
      });

      setIsAnnouncing(true);
    }
  }, [state, isLoading, isAnnouncing]);

  // التعامل مع انتهاء الإعلان
  const handleAnnouncementComplete = () => {
    setIsAnnouncing(false);
    setCurrentAnnouncement(null);
  };

  // تحديث البيانات يدويًا
  const handleManualRefresh = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      await refetch();
    } catch (error) {
      console.error('خطأ في تحديث البيانات:', error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // تبديل وضع الظلام/الضوء
  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    // يمكننا حفظ الإعداد في localStorage هنا
    try {
      localStorage.setItem('displayDarkMode', JSON.stringify(!isDarkMode));
    } catch (e) {
      console.error('فشل حفظ إعدادات السمة:', e);
    }
  };

  // استرجاع إعدادات السمة من localStorage عند التحميل
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('displayDarkMode');
      if (savedTheme !== null) {
        setIsDarkMode(JSON.parse(savedTheme));
      }
    } catch (e) {
      console.error('فشل استرجاع إعدادات السمة:', e);
    }
  }, []);

  // استخراج البيانات المطلوبة من حالة الطابور
  const waitingTickets = state?.tickets?.filter(ticket => ticket.status === 'waiting') || [];
  const servingTickets = state?.tickets?.filter(ticket => ticket.status === 'serving') || [];
  const completedTickets = state?.tickets?.filter(ticket => ticket.status === 'complete') || [];
  const activeCounters = state?.counters?.filter(counter => counter.status === 'active') || [];

  // تحديد متوسط وقت الانتظار
  const allTickets = [...(state?.tickets || [])];

  // عرض حالة التحميل أو الخطأ
  if (isLoading) {
    return (
      <div className={`flex h-screen items-center justify-center ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`text-2xl ${isDarkMode ? 'text-white' : 'text-gray-800'}`}
        >
          جاري تحميل بيانات الطابور...
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex h-screen flex-col items-center justify-center ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800'}`}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 text-2xl"
        >
          حدث خطأ أثناء تحميل بيانات الطابور
        </motion.div>
        <div className="text-red-400">{error.message}</div>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  // عرض الشاشة الرئيسية
  return (
    <div className={`h-screen overflow-hidden ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800'}`}>
      {/* رأس الشاشة */}
      <header className={`flex items-center justify-between ${isDarkMode ? 'bg-blue-900' : 'bg-blue-600'} p-4`}>
        <h1 className="text-2xl font-bold text-white">شاشة العرض {displayId}</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            className="rounded-full bg-opacity-50 p-2 text-white transition-colors hover:bg-opacity-70"
            title={isDarkMode ? "تفعيل الوضع الفاتح" : "تفعيل الوضع المظلم"}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            onClick={handleManualRefresh}
            className={`rounded-full bg-opacity-50 p-2 text-white transition-colors hover:bg-opacity-70 ${
              isRefreshing ? 'animate-spin' : ''
            }`}
            disabled={isRefreshing}
            title="تحديث البيانات"
          >
            <RotateCw size={20} />
          </button>
          <ConnectionStatus />
        </div>
      </header>

      <div className="flex h-[calc(100vh-64px)] flex-col p-4">
        {/* عرض التذكرة المستدعاة حاليًا في المنتصف */}
        <div className="mb-4 flex-grow">
          <AnimatePresence mode="wait">
            {isAnnouncing && currentAnnouncement ? (
              <ActiveCallDisplay
                ticket={currentAnnouncement}
                counter={state?.counters?.find(c => c.id === currentAnnouncement.counterNumber)}
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={`flex h-full flex-col items-center justify-center rounded-lg ${
                isDarkMode ? 'bg-gray-800' : 'bg-white shadow-md'
              }`}>
                <div className="text-center text-gray-400">
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="mb-4 flex items-center justify-center text-6xl"
                  >
                    <Clock size={48} className="mr-2 opacity-60" />
                  </motion.div>
                  <p className="text-xl">في انتظار مناداة التذكرة التالية...</p>
                  <p className="mt-2 text-sm">
                    {waitingTickets.length > 0
                      ? `${waitingTickets.length} تذكرة في قائمة الانتظار`
                      : 'لا توجد تذاكر في الانتظار حاليًا'}
                  </p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* منطقة القسم السفلي: تقسم إلى 3 أقسام */}
        <div className="grid h-[45%] grid-cols-12 gap-4">
          {/* قائمة الانتظار - 4 أعمدة */}
          <div className={`col-span-4 flex flex-col overflow-hidden rounded-lg ${
            isDarkMode ? 'bg-gray-800' : 'bg-white shadow-md'
          }`}>
            <div className={`p-2 text-center text-xl text-white ${
              isDarkMode ? 'bg-amber-800' : 'bg-amber-600'
            }`}>
              قائمة الانتظار - {waitingTickets.length} تذكرة
            </div>
            <WaitingList tickets={waitingTickets} isDarkMode={isDarkMode} />
          </div>

          {/* التذاكر قيد الخدمة - 4 أعمدة */}
          <div className={`col-span-4 flex flex-col overflow-hidden rounded-lg ${
            isDarkMode ? 'bg-gray-800' : 'bg-white shadow-md'
          }`}>
            <div className={`p-2 text-center text-xl text-white ${
              isDarkMode ? 'bg-blue-800' : 'bg-blue-600'
            }`}>
              تذاكر قيد الخدمة - {servingTickets.length}
            </div>
            <ServingTicketsList
              tickets={servingTickets}
              counters={state?.counters || []}
              isDarkMode={isDarkMode}
              highlightedTicketId={lastAnnouncedRef.current}
            />
          </div>

          {/* حالة المكاتب وإحصائيات - 4 أعمدة */}
          <div className="col-span-4 flex flex-col gap-4">
            {/* حالة المكاتب */}
            <div className={`overflow-hidden rounded-lg ${
              isDarkMode ? 'bg-gray-800' : 'bg-white shadow-md'
            }`}>
              <div className={`p-2 text-center text-xl text-white ${
                isDarkMode ? 'bg-green-800' : 'bg-green-600'
              }`}>
                حالة المكاتب - {activeCounters.length} مكتب
              </div>
              <div className="grid max-h-[20vh] grid-cols-2 gap-2 overflow-y-auto p-3">
                {activeCounters.length > 0 ? (
                  activeCounters.map((counter) => (
                    <CounterStatus
                      key={counter.id}
                      counter={counter}
                      currentTicket={state?.tickets?.find(t => t.id === counter.currentTicket)}
                      isDarkMode={isDarkMode}
                    />
                  ))
                ) : (
                  <div className="col-span-2 p-4 text-center text-gray-400">
                    لا توجد مكاتب نشطة حاليًا
                  </div>
                )}
              </div>
            </div>

            {/* آخر التذاكر المخدومة */}
            <div className={`flex-grow overflow-hidden rounded-lg ${
              isDarkMode ? 'bg-gray-800' : 'bg-white shadow-md'
            }`}>
              <div className={`p-2 text-center text-xl text-white ${
                isDarkMode ? 'bg-purple-800' : 'bg-purple-600'
              }`}>
                آخر التذاكر المخدومة
              </div>
              <RecentlyServedList tickets={recentlyServed} isDarkMode={isDarkMode} />
            </div>
          </div>
        </div>
      </div>

      {/* معلن التذاكر */}
      <TicketAnnouncer
        ticket={currentAnnouncement}
        onAnnouncementComplete={handleAnnouncementComplete}
        isActive={isAnnouncing}
      />

      {/* شريط الحالة السفلي */}
      <footer className={`absolute bottom-0 left-0 right-0 p-2 text-center ${
        isDarkMode ? 'bg-gray-800' : 'bg-gray-200'
      }`}>
        {soundError ? (
          <div className="text-red-400">تحذير: {soundError?.message || 'مشكلة في تحميل ملفات الصوت'}</div>
        ) : (
          <div className="text-xs text-gray-400">
            آخر تحديث: {lastUpdated?.toLocaleTimeString('ar-SA') || new Date().toLocaleTimeString('ar-SA')}
          </div>
        )}
      </footer>
    </div>
  );
};
