import { useState, useEffect, useCallback, JSX } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueue } from '../context/QueueContext'
import { Clock, Users, Calendar, AlertCircle } from 'lucide-react'

type ServiceType = {
  id: number
  name: string
  type: string
  icon?: JSX.Element
  color?: string
}

type TicketDetails = {
  number: number
  service: string
  date: string
  time: string
  waitTime: string
}

export default function CustomerScreen(): JSX.Element {
  const { queueState, addTicket, isConnected, refreshQueueState, reconnectServer } = useQueue()
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [isPrinting, setIsPrinting] = useState(false)
  const [showTicket, setShowTicket] = useState(false)
  const [ticketDetails, setTicketDetails] = useState<TicketDetails | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [services, setServices] = useState<ServiceType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  // Fetch services from database
  useEffect(() => {
    const fetchServices = async () => {
      setIsLoading(true)
      try {
        const hasAdminDb = (api: any): api is { adminDb: { getServices: () => Promise<any[]> } } => {
          return api && 'adminDb' in api && typeof api.adminDb.getServices === 'function';
        };

        if (window.api && hasAdminDb(window.api)) {
          const dbServices = await window.api.adminDb.getServices();

          if (dbServices && dbServices.length > 0) {
            const mappedServices = dbServices.map(s => ({
              id: s.id,
              name: s.name,
              type: s.type,
              icon: getServiceIcon(s.type),
              color: getServiceColorClass(s.type)
            }));

            setServices(mappedServices);
          } else {
            setServices(getDefaultServices());
          }
        } else {
          setServices(getDefaultServices());
        }
      } catch (error) {
        console.error('Error fetching services:', error);
        setServices(getDefaultServices());
      } finally {
        setIsLoading(false);
      }
    };

    fetchServices();
  }, []);

  const getDefaultServices = (): ServiceType[] => {
    return [
      {
        id: 1,
        name: 'الخدمات العامة',
        type: 'general',
        icon: getServiceIcon('general'),
        color: 'green'
      },
      {
        id: 2,
        name: 'الخدمات المالية',
        type: 'financial',
        icon: getServiceIcon('financial'),
        color: 'blue'
      },
      {
        id: 3,
        name: 'الدعم الفني',
        type: 'technical',
        icon: getServiceIcon('technical'),
        color: 'purple'
      }
    ];
  };

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    let isUnmounted = false;

    // Poll only if not connected to socket (fallback)
    function startPolling() {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(() => {
        if (!isConnected && !isUnmounted) {
          refreshQueueState(false).catch(() => {});
        }
      }, 30000); // Poll every 30 seconds as fallback
    }

    if (!isConnected) {
      startPolling();
    }

    return () => {
      isUnmounted = true;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [refreshQueueState, isConnected]);

  useEffect(() => {
    if (!isConnected) {
      const attemptReconnect = async () => {
        try {
          await reconnectServer();
        } catch (error) {
          console.error('Reconnection error:', error);
          setErrorMessage('فشل الاتصال. الرجاء المحاولة مرة أخرى.');
        }
      };

      attemptReconnect();
    }
  }, [isConnected, reconnectServer]);

  const getServiceIcon = (type: string): JSX.Element => {
    switch (type.toLowerCase()) {
      case 'general':
        return (
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-green-600"
            >
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>
          </div>
        );
      case 'financial':
      case 'مالي':
      case 'مالية':
        return (
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-100">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-blue-600"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 6v12"></path>
              <path d="M8 12h8"></path>
            </svg>
          </div>
        );
      case 'technical':
      case 'فني':
      case 'تقني':
        return (
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-purple-100">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-purple-600"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
            </svg>
          </div>
        );
      default:
        const colors = ['blue', 'green', 'purple', 'indigo', 'teal', 'red', 'orange', 'amber', 'cyan'];
        const colorIndex = Math.abs(type.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length;
        const color = colors[colorIndex];

        return (
          <div className={`flex items-center justify-center w-16 h-16 rounded-full bg-${color}-100`}>
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`text-${color}-600`}
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline>
              <polyline points="7.5 19.79 7.5 14.6 3 12"></polyline>
              <polyline points="21 12 16.5 14.6 16.5 19.79"></polyline>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
        );
    }
  };

  const getServiceColorClass = (type: string): string => {
    const lowerType = type.toLowerCase();

    if (lowerType === 'general') return 'green';
    if (lowerType === 'financial' || lowerType === 'مالي' || lowerType === 'مالية') return 'blue';
    if (lowerType === 'technical' || lowerType === 'فني' || lowerType === 'تقني') return 'purple';

    const colors = ['blue', 'green', 'purple', 'indigo', 'teal', 'red', 'orange', 'amber', 'cyan'];
    const colorIndex = Math.abs(type.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length;
    return colors[colorIndex];
  };

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (showTicket) {
      timer = setTimeout(() => {
        setShowTicket(false)
        setSelectedService(null)
      }, 5000)
    }

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [showTicket])

  // تحسين تنسيق التاريخ
  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('ar', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date)
  }

  // تحسين تنسيق الوقت
  const formatTime = (date: Date): string => {
    return new Intl.DateTimeFormat('ar', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(date)
  }

  // حساب وقت الانتظار المتوقع
  const calculateEstimatedWaitTime = (): string => {
    const waitingCount = queueState?.tickets?.filter(t => t.status === 'waiting').length || 0;
    const activeCounters = queueState?.counters?.filter(c => c.status === 'active').length || 1;

    const averageTimePerTicket = 6;
    const positionInQueue = waitingCount;

    let estimatedMinutes = Math.round((positionInQueue / activeCounters) * averageTimePerTicket);

    const variation = Math.random() * 0.4 - 0.2;
    estimatedMinutes = Math.max(1, Math.round(estimatedMinutes * (1 + variation)));

    return `${estimatedMinutes} دقيقة تقريباً`;
  };

  // طباعة التذكرة
  const handlePrintTicket = useCallback(async () => {
    if (!selectedService) return;

    if (!isConnected) {
      try {
        await reconnectServer();
      } catch (error) {
        console.error('Connection error during ticket printing:', error);
        setErrorMessage('فشل الاتصال بالخادم. سيتم العمل بالوضع غير المتصل.');
      }
    }

    setIsPrinting(true);
    try {
      const serviceInfo = services.find(s => s.type === selectedService);

      const newTicket = await addTicket(selectedService);

      await refreshQueueState();

      await new Promise((resolve) => setTimeout(resolve, 1500));

      setTicketDetails({
        number: newTicket.id,
        service: serviceInfo?.name || selectedService,
        date: formatDate(new Date(newTicket.timestamp)),
        time: formatTime(new Date(newTicket.timestamp)),
        waitTime: calculateEstimatedWaitTime()
      });

      setShowTicket(true);

      try {
        const audio = new Audio('/resources/assets/sounds/notification.mp3');
        audio.play();
      } catch (error) {
        console.error('Error playing sound:', error);
      }
    } catch (error) {
      console.error('Error printing ticket:', error);
      setErrorMessage('حدث خطأ أثناء طباعة التذكرة. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsPrinting(false);
    }
  }, [selectedService, services, addTicket, refreshQueueState, isConnected, reconnectServer, calculateEstimatedWaitTime]);

  // إغلاق نافذة التذكرة
  const handleCloseTicket = (): void => {
    setShowTicket(false)
    setSelectedService(null)
  }

  // عرض حالة الاتصال
  const renderConnectionStatus = () => {
    if (!isConnected) {
      return (
        <div className="fixed bottom-4 left-4 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-lg shadow-md flex items-center z-50">
          <div className="w-3 h-3 rounded-full bg-red-500 mr-2 animate-pulse"></div>
          <span>
            {errorMessage || 'غير متصل بالخادم'}
          </span>
          <button
            onClick={() => reconnectServer().catch(err => console.error('Reconnect error:', err))}
            className="mr-2 bg-red-200 hover:bg-red-300 text-red-800 px-2 py-1 rounded-md text-sm"
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return null;
  };

  // عدد العملاء في الانتظار
  const waitingCount = queueState?.tickets?.filter((t) => t.status === 'waiting')?.length || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-white flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-md max-w-sm w-full">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-xl font-medium text-gray-700">جاري تحميل الخدمات...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-white overflow-hidden"
      dir="rtl"
    >
      {renderConnectionStatus()}

      {errorMessage && errorMessage !== 'غير متصل بالخادم' && (
        <div className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-md z-50">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="mr-3">
              <p className="text-sm">{errorMessage}</p>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="mr-auto text-red-700 hover:text-red-900"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <header className="bg-white rounded-2xl shadow-md p-4 sm:p-6 mb-6 sm:mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 text-white p-2 rounded-lg">
                <Users size={24} />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-700 to-blue-600 bg-clip-text text-transparent">
                نظام إدارة الطابور
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-gray-700">
              <div className="flex items-center">
                <Calendar size={18} className="text-indigo-600 ml-1" />
                <div className="text-sm sm:text-base font-medium">{formatDate(currentTime)}</div>
              </div>
              <div className="mx-2 h-4 w-px bg-gray-300 hidden sm:block"></div>
              <div className="flex items-center">
                <Clock size={18} className="text-indigo-600 ml-1" />
                <div className="text-sm sm:text-base">{formatTime(currentTime)}</div>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1">
          <motion.div
            className={`rounded-xl mb-6 sm:mb-8 p-3 sm:p-4 text-center shadow-md ${
              waitingCount > 0
                ? 'bg-amber-50 border border-amber-200'
                : 'bg-green-50 border border-green-200'
            }`}
            animate={{
              scale: waitingCount > 10 ? [1, 1.02, 1] : 1
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="flex items-center justify-center gap-2 sm:gap-3">
              <AlertCircle
                size={20}
                className={waitingCount > 10 ? 'text-amber-500' : 'text-green-500'}
              />
              <p className="text-base sm:text-xl font-medium">
                {waitingCount > 0
                  ? `يوجد حالياً ${waitingCount} عميل في الانتظار`
                  : 'لا يوجد عملاء في الانتظار حالياً'}
              </p>
            </div>
          </motion.div>

          <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-8 mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-center mb-6 sm:mb-10 bg-gradient-to-r from-indigo-700 to-blue-600 bg-clip-text text-transparent">
              اختر نوع الخدمة المطلوبة
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 max-w-5xl mx-auto">
              {services.map((service) => (
                <motion.button
                  key={service.id}
                  onClick={() => setSelectedService(service.type)}
                  className={`relative overflow-hidden rounded-xl p-4 sm:p-6 flex flex-col items-center justify-center min-h-[160px] sm:min-h-[200px] transition-all ${
                    selectedService === service.type
                      ? `bg-${service.color}-50 border-2 border-${service.color}-500 shadow-lg`
                      : 'bg-white border border-gray-100 hover:border-gray-200 shadow-sm hover:shadow'
                  }`}
                  whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="absolute top-0 right-0 opacity-5">
                    <svg width="100" height="100" viewBox="0 0 80 80" fill="currentColor">
                      <circle cx="40" cy="40" r="40" />
                    </svg>
                  </div>

                  {service.icon}
                  <span className={`text-xl sm:text-2xl font-medium mt-4 sm:mt-6 text-${service.color}-800`}>
                    {service.name}
                  </span>

                  {selectedService === service.type && (
                    <motion.div
                      className={`absolute bottom-0 left-0 right-0 h-1 bg-${service.color}-500`}
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                    />
                  )}
                </motion.button>
              ))}
            </div>

            <AnimatePresence>
              {selectedService && (
                <motion.div
                  className="mt-6 sm:mt-10 flex justify-center"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  <button
                    onClick={handlePrintTicket}
                    disabled={isPrinting}
                    className={`py-3 sm:py-4 px-8 sm:px-12 rounded-xl text-lg sm:text-xl font-medium transition-all
                      ${
                        isPrinting
                          ? 'bg-gray-400 cursor-wait'
                          : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 active:from-indigo-800 active:to-blue-800'
                      } text-white shadow-lg`}
                  >
                    {isPrinting ? (
                      <div className="flex items-center gap-3 justify-center">
                        <span>جاري طباعة التذكرة</span>
                        <div className="w-5 h-5 sm:w-6 sm:h-6 border-3 sm:border-4 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      'طباعة التذكرة'
                    )}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {showTicket && ticketDetails && (
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 cursor-pointer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseTicket}
            >
              <motion.div
                className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md w-full"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="items-center">
                  <div className="w-full flex justify-between items-center mb-4 sm:mb-6">
                    <div className="flex items-center">
                      <div className="h-3 w-3 rounded-full bg-green-500 ml-2"></div>
                      <span className="text-green-600 font-medium">تمت الطباعة بنجاح</span>
                    </div>
                    <div className="text-sm text-gray-500">{ticketDetails.time}</div>
                  </div>

                  <div className="w-full border-2 border-dashed border-gray-300 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
                    <div className="flex flex-col items-center">
                      <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4">
                        {ticketDetails.service}
                      </h3>

                      <div className="flex flex-col items-center">
                        <span className="text-sm text-gray-500 mb-1">رقم التذكرة</span>
                        <span className="text-4xl sm:text-5xl font-bold text-indigo-700 mb-4">
                          {ticketDetails.number}
                        </span>
                      </div>

                      <div className="w-full border-t border-gray-200 my-4"></div>

                      <div className="w-full flex justify-between text-sm text-gray-600 mb-2">
                        <span>التاريخ:</span>
                        <span>{ticketDetails.date}</span>
                      </div>

                      <div className="w-full flex justify-between text-sm text-gray-600">
                        <span>الوقت المتوقع:</span>
                        <span>{ticketDetails.waitTime}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-center text-sm text-gray-500">
                    شكراً لاستخدامكم نظام إدارة الطابور
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
