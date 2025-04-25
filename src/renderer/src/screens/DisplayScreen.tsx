import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueue } from '../context/QueueContext'
import ConnectionStatus from '../components/ConnectionStatus'
import { Ticket as ServiceTicket } from '../services/QueueService'

// Define proper TypeScript interfaces
type ServiceType = 'general' | 'financial' | 'technical'

// Local Ticket interface that extends the service Ticket but with strongly typed serviceType
interface Ticket extends Omit<ServiceTicket, 'serviceType'> {
  serviceType: ServiceType;
}

// Function to convert string serviceType to our strongly-typed ServiceType
const convertServiceType = (type: string): ServiceType => {
  switch (type) {
    case 'financial': return 'financial';
    case 'technical': return 'technical';
    case 'general':
    default: return 'general';
  }
};

// Enhanced service type information with improved styling
const serviceInfo = {
  general: {
    name: 'الخدمات العامة',
    icon: '👥',
    color: 'blue',
    gradient: 'from-blue-600 to-blue-800',
    lightGradient: 'from-blue-50 to-blue-100',
    lightBg: 'bg-blue-50',
    outlineColor: 'border-blue-200',
    accent: 'text-blue-700',
    softBg: 'bg-blue-100/40',
    glow: 'shadow-blue-200'
  },
  financial: {
    name: 'الخدمات المالية',
    icon: '💰',
    color: 'emerald',
    gradient: 'from-emerald-500 to-emerald-700',
    lightGradient: 'from-emerald-50 to-emerald-100',
    lightBg: 'bg-emerald-50',
    outlineColor: 'border-emerald-200',
    accent: 'text-emerald-700',
    softBg: 'bg-emerald-100/40',
    glow: 'shadow-emerald-200'
  },
  technical: {
    name: 'الدعم الفني',
    icon: '🔧',
    color: 'violet',
    gradient: 'from-violet-600 to-violet-800',
    lightGradient: 'from-violet-50 to-violet-100',
    lightBg: 'bg-violet-50',
    outlineColor: 'border-violet-200',
    accent: 'text-violet-700',
    softBg: 'bg-violet-100/40',
    glow: 'shadow-violet-200'
  }
}

export default function DisplayScreen(): React.JSX.Element {
  const { queueState, isLoading, error } = useQueue()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [recentlyServed, setRecentlyServed] = useState<Ticket[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const prevServing = useRef<Record<number, number | null>>({})
  const [showNotification, setShowNotification] = useState(false)
  const [lastCalledTicket, setLastCalledTicket] = useState<Ticket | null>(null)
  const lastQueueStateRef = useRef<string>('')
  const isInitialRender = useRef(true)
  const waitingCountRef = useRef<number>(0)
  const prevTicketsRef = useRef<Ticket[]>([])
  const stableQueueState = useRef(queueState)

  // Update the stable reference when queueState meaningfully changes
  useEffect(() => {
    if (!queueState) return;

    const newWaitingCount = queueState.tickets.filter(t => t.status === 'waiting').length;
    const isWaitingCountChanged = newWaitingCount !== waitingCountRef.current;

    const relevantQueueState = {
      serving: queueState.tickets.filter(t => t.status === 'serving'),
      counters: queueState.counters.map(c => ({ id: c.id, currentTicket: c.currentTicket }))
    };

    const queueStateStr = JSON.stringify(relevantQueueState);
    const hasRelevantChange = queueStateStr !== lastQueueStateRef.current;

    if (hasRelevantChange || isWaitingCountChanged || isInitialRender.current) {
      stableQueueState.current = queueState;
      lastQueueStateRef.current = queueStateStr;
      waitingCountRef.current = newWaitingCount;
      isInitialRender.current = false;
    }
  }, [queueState]);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio()
    audioRef.current.src = '/assets/sounds/notification.mp3'
    audioRef.current.load()

    const handleError = (e: ErrorEvent) => {
      console.warn('Audio loading error:', e)
    }

    audioRef.current.addEventListener('error', handleError as EventListener)

    return () => {
      audioRef.current?.removeEventListener('error', handleError as EventListener)
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  // Function to safely play audio
  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch((error) => {
        console.warn('Could not play notification sound:', error.message)
      })
    }
  }, [])

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Start the socket server and connect to fixed IP
  useEffect(() => {
    // Ask main process to start the socket server (for display screen)
    if (window.electron && window.electron.startSocketServer) {
      window.electron.startSocketServer();
    } else if (window.ipcRenderer) {
      window.ipcRenderer.send('start-socket-server');
    }
    
    console.log('Display screen initializing - connecting to 192.168.1.14:4000');
    
    // إضافة وسيلة مساعدة لمعرفة ما إذا كانت هذه الشاشة تعمل على نفس الخادم
    const isLocalServer = async () => {
      try {
        // Get network info from main process if available
        if (window.api && window.api.getNetworkInfo) {
          const info = await window.api.getNetworkInfo();
          return info.localIp === '192.168.1.14';
        }
      } catch (error) {
        console.error('Error checking if local server:', error);
      }
      return false;
    };
    
    // تحقق مما إذا كانت هذه الشاشة على نفس الخادم وتصرف بناءً على ذلك
    isLocalServer().then(isLocal => {
      if (isLocal) {
        console.log('This is the display on the server machine - will start socket server');
      } else {
        console.log('This is a remote display - will connect to server');
      }
    });
    
    // Connect to the fixed IP in all cases
    import('../services/socket/client').then(socketClient => {
      socketClient.connectToServer({
        serverHost: '192.168.1.14',
        serverPort: 4000,
        reconnectionAttempts: 15,
        reconnectionDelay: 1000,
        timeout: 10000,
        heartbeatInterval: 10000,
        heartbeatTimeout: 5000
      }).catch(err => console.error('Failed to connect to socket server:', err));
    });
  }, []);

  // Process queue state updates with optimization
  useEffect(() => {
    if (!queueState) return

    if (isInitialRender.current) {
      isInitialRender.current = false;

      const convertedTickets = queueState.tickets.map(ticket => ({
        ...ticket,
        serviceType: convertServiceType(ticket.serviceType)
      })) as Ticket[];

      prevTicketsRef.current = convertedTickets;

      prevServing.current = queueState.counters.reduce((acc, counter) => {
        acc[counter.id] = counter.currentTicket;
        return acc;
      }, {} as Record<number, number | null>);
      return;
    }

    const changedCounters = queueState.counters.filter((counter) => {
      const prevTicket = prevServing.current[counter.id];
      return prevTicket !== counter.currentTicket && counter.currentTicket !== null;
    });

    if (changedCounters.length > 0) {
      playNotificationSound();

      const justCalledTicketId = changedCounters[0].currentTicket;
      const justCalledTicket = queueState.tickets.find((t) => t.id === justCalledTicketId);

      if (justCalledTicket) {
        const ticketWithCounter = {
          ...justCalledTicket,
          serviceType: convertServiceType(justCalledTicket.serviceType),
          counterNumber: changedCounters[0].id
        } as Ticket;

        setLastCalledTicket(ticketWithCounter);
        setShowNotification(true);

        setTimeout(() => {
          setShowNotification(false);
        }, 5000);
      }
    }

    prevServing.current = queueState.counters.reduce((acc, counter) => {
      acc[counter.id] = counter.currentTicket;
      return acc;
    }, {} as Record<number, number | null>);

    const servingTickets = queueState.tickets.filter((t) => t.status === 'serving');
    if (servingTickets.length > 0) {
      setRecentlyServed((prev) => {
        const newTickets = servingTickets
          .filter(
            (newT) => !prevTicketsRef.current.some((oldT) => oldT.id === newT.id && oldT.status === 'serving')
          )
          .map(ticket => ({
            ...ticket,
            serviceType: convertServiceType(ticket.serviceType)
          })) as Ticket[];

        return [...newTickets, ...prev].slice(0, 3);
      });
    }

    const updatedTickets = queueState.tickets.map(ticket => ({
      ...ticket,
      serviceType: convertServiceType(ticket.serviceType)
    })) as Ticket[];

    prevTicketsRef.current = updatedTickets;
  }, [queueState, playNotificationSound]);

  const servingTickets = useMemo(() => {
    if (!stableQueueState.current?.tickets) return [];

    return stableQueueState.current.tickets
      .filter((t) => t.status === 'serving')
      .map((ticket) => {
        const counter = stableQueueState.current?.counters.find((c) => c.currentTicket === ticket.id);
        return {
          ...ticket,
          serviceType: convertServiceType(ticket.serviceType),
          counterNumber: counter?.id || ticket.counterNumber
        } as Ticket;
      });
  }, [stableQueueState.current]);

  const currentTicket = useMemo(() => servingTickets[0] || null, [servingTickets]);

  const waitingCount = useMemo(
    () => waitingCountRef.current,
    [waitingCountRef.current]
  );

  const getServiceInfo = useCallback((
    type: ServiceType | undefined
  ): (typeof serviceInfo)[keyof typeof serviceInfo] => {
    return type && serviceInfo[type] ? serviceInfo[type] : serviceInfo.general;
  }, []);

  if (isLoading) {
    return (
      <div className="grid place-items-center h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-white">
        <motion.div
          className="bg-white p-6 rounded-2xl shadow-lg border border-blue-100 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-100 rounded-full"></div>
            <motion.div
              className="absolute top-0 left-0 w-full h-full border-4 border-t-blue-600 border-r-transparent border-b-transparent border-l-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
          </div>
          <p className="text-xl font-medium text-gray-700">جاري تحميل البيانات...</p>
        </motion.div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid place-items-center h-screen bg-gradient-to-br from-red-50 via-pink-50 to-white p-6">
        <motion.div
          className="bg-white p-6 rounded-2xl shadow-lg border border-red-100 text-center max-w-md"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 100 }}
        >
          <div className="bg-red-50 p-3 rounded-full mx-auto w-16 h-16 grid place-items-center mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <p className="text-xl text-gray-700 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg hover:from-blue-700 hover:to-indigo-800 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            إعادة تحميل
          </button>
        </motion.div>
      </div>
    )
  }

  if (!stableQueueState.current) {
    return (
      <div className="grid place-items-center h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-white">
        <p className="text-xl text-gray-700 bg-white px-6 py-4 rounded-2xl shadow-lg border border-blue-100">
          لا توجد بيانات متاحة
        </p>
      </div>
    )
  }

  return (
    <div
      className="h-screen w-full bg-gradient-to-b from-slate-50 to-white overflow-hidden"
      dir="rtl"
    >
      <div className="fixed top-0 left-0 z-50 p-2">
        <ConnectionStatus compact />
      </div>

      <div className="fixed inset-0 overflow-hidden z-0 opacity-10">
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-blue-500 blur-3xl"></div>
        <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-emerald-500 blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-violet-500 blur-3xl opacity-30"></div>
      </div>

      <AnimatePresence>
        {showNotification && lastCalledTicket && (
          <motion.div
            className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50"
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <div
              className={`grid grid-cols-[auto,1fr] gap-4 items-center rounded-xl shadow-xl bg-gradient-to-r ${getServiceInfo(lastCalledTicket.serviceType).gradient} text-white px-5 py-4`}
            >
              <motion.div
                className="text-3xl bg-white/20 p-2 rounded-full"
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{
                  duration: 1,
                  repeat: 2,
                  repeatType: 'reverse'
                }}
              >
                {getServiceInfo(lastCalledTicket.serviceType).icon}
              </motion.div>
              <div>
                <p className="text-lg font-bold mb-1">تم استدعاء رقم جديد</p>
                <div className="grid grid-cols-[auto,auto,auto] gap-3 items-center">
                  <motion.span
                    className="text-2xl font-bold bg-white/20 px-3 py-1 rounded-lg"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1, repeat: 2, repeatType: 'reverse' }}
                  >
                    {lastCalledTicket.id}
                  </motion.span>
                  <motion.span
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 1, repeat: 2, repeatType: 'mirror' }}
                    className="text-lg"
                  >
                    →
                  </motion.span>
                  <span className="bg-white/20 px-2 py-1 rounded-lg text-sm">
                    المكتب {lastCalledTicket.counterNumber}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 h-full grid grid-rows-[auto,1fr] max-w-6xl mx-auto">
        <div className="grid grid-cols-2 items-center p-3 border-b border-gray-100">
          <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-100 grid grid-cols-[1fr,auto] items-center gap-2 justify-self-end">
            <div>
              <div className="text-xl font-medium text-blue-700 font-mono tracking-wide">
                {currentTime.toLocaleTimeString('ar')}
              </div>
              <div className="text-xs text-gray-500">
                {currentTime.toLocaleDateString('ar', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
            </div>
            <motion.div
              className="text-gray-400"
              animate={{ rotate: 360 }}
              transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </motion.div>
          </div>
        </div>

        <div className="grid grid-rows-[1fr,auto,auto] gap-3 p-4 overflow-hidden">
          <div className="w-full">
            <AnimatePresence mode="wait">
              {currentTicket ? (
                <motion.div
                  key={`current-${currentTicket.id}`}
                  className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100 h-full relative"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-blue-50 to-transparent opacity-50"></div>
                  <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-blue-50 to-transparent opacity-50"></div>

                  <div
                    className={`bg-gradient-to-r ${getServiceInfo(currentTicket.serviceType).gradient} p-4 text-center text-white relative overflow-hidden`}
                  >
                    <div className="absolute inset-0 overflow-hidden">
                      <motion.div
                        className="absolute -right-12 -top-12 w-32 h-32 rounded-full bg-white opacity-10"
                        animate={{
                          scale: [1, 1.2, 1],
                          x: [0, 10, 0],
                          y: [0, 10, 0]
                        }}
                        transition={{
                          duration: 8,
                          repeat: Infinity,
                          repeatType: 'reverse'
                        }}
                      />
                      <motion.div
                        className="absolute -left-12 -bottom-12 w-32 h-32 rounded-full bg-white opacity-10"
                        animate={{
                          scale: [1, 1.5, 1],
                          x: [0, -10, 0],
                          y: [0, -10, 0]
                        }}
                        transition={{
                          duration: 7,
                          repeat: Infinity,
                          repeatType: 'reverse',
                          delay: 1
                        }}
                      />
                    </div>

                    <div className="grid grid-flow-col auto-cols-max gap-2 items-center justify-center relative z-10">
                      <motion.span
                        className="text-3xl"
                        animate={{
                          rotate: [0, 10, -10, 0],
                          scale: [1, 1.2, 1]
                        }}
                        transition={{
                          duration: 3,
                          repeat: Infinity,
                          repeatType: 'reverse'
                        }}
                      >
                        {getServiceInfo(currentTicket.serviceType).icon}
                      </motion.span>
                      <h2 className="text-2xl font-bold">الرقم التالي</h2>
                    </div>
                  </div>

                  <div className="grid place-items-center h-[calc(100%-4rem)] relative">
                    <div className="mb-6 relative">
                      <motion.div
                        className={`absolute -inset-2 bg-gradient-to-r ${getServiceInfo(currentTicket.serviceType).lightGradient} rounded-full blur-lg`}
                        animate={{
                          scale: [1, 1.1, 1],
                          opacity: [0.7, 1, 0.7]
                        }}
                        transition={{
                          duration: 3,
                          repeat: Infinity,
                          repeatType: 'reverse'
                        }}
                      />
                      <motion.div
                        className={`relative grid place-items-center text-7xl font-bold bg-gradient-to-br ${getServiceInfo(currentTicket.serviceType).gradient} text-transparent bg-clip-text mb-2 rounded-full ${getServiceInfo(currentTicket.serviceType).lightBg} ${getServiceInfo(currentTicket.serviceType).outlineColor} border-2 w-40 h-40 shadow-lg ${getServiceInfo(currentTicket.serviceType).glow}`}
                        initial={{ scale: 0.8, rotate: -5 }}
                        animate={{
                          scale: 1,
                          rotate: 0,
                          y: [0, -5, 0]
                        }}
                        transition={{
                          type: 'spring',
                          stiffness: 200,
                          damping: 15,
                          y: {
                            duration: 3,
                            repeat: Infinity,
                            repeatType: 'reverse'
                          }
                        }}
                      >
                        {currentTicket.id}
                      </motion.div>
                    </div>

                    <div className="text-2xl font-bold text-gray-800 mb-4 text-center">
                      <span>يرجى التوجه إلى المكتب رقم</span>
                      <motion.div className="relative inline-block mx-3">
                        <motion.div
                          className="absolute inset-0 bg-blue-600/20 blur-md rounded-lg"
                          animate={{
                            scale: [1, 1.2, 1]
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            repeatType: 'reverse'
                          }}
                        />
                        <motion.span
                          className="relative inline-grid place-items-center bg-blue-600 text-white text-3xl w-12 h-12 rounded-lg shadow-md"
                          animate={{
                            scale: [1, 1.05, 1],
                            backgroundColor: ['#2563eb', '#1e40af', '#2563eb']
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            repeatType: 'reverse'
                          }}
                        >
                          {currentTicket.counterNumber}
                        </motion.span>
                      </motion.div>
                    </div>

                    <div
                      className={`inline-grid grid-flow-col auto-cols-max items-center gap-2 text-base ${getServiceInfo(currentTicket.serviceType).lightBg} ${getServiceInfo(currentTicket.serviceType).accent} px-4 py-2 rounded-full ${getServiceInfo(currentTicket.serviceType).outlineColor} border shadow-md`}
                    >
                      <span className="text-xl">
                        {getServiceInfo(currentTicket.serviceType).icon}
                      </span>
                      <span className="font-medium">
                        {getServiceInfo(currentTicket.serviceType).name}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  className="bg-white rounded-2xl shadow-md text-center h-full grid place-items-center border border-slate-100"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="w-full h-full grid place-items-center relative overflow-hidden">
                    <div className="absolute inset-0 overflow-hidden opacity-5">
                      <motion.div
                        className="absolute top-0 left-0 w-full h-full"
                        animate={{
                          backgroundPosition: ['0% 0%', '100% 100%']
                        }}
                        transition={{ duration: 20, repeat: Infinity, repeatType: 'reverse' }}
                        style={{
                          backgroundImage:
                            'radial-gradient(circle at 50% 50%, #3b82f6 0%, transparent 50%)',
                          backgroundSize: '100% 100%'
                        }}
                      />
                    </div>

                    <div className="p-4">
                      <motion.div
                        animate={{
                          y: [0, -10, 0],
                          opacity: [0.7, 1, 0.7]
                        }}
                        transition={{
                          duration: 4,
                          repeat: Infinity,
                          repeatType: 'reverse'
                        }}
                        className="relative"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-24 w-24 mx-auto mb-6 text-blue-100"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                      </motion.div>
                      <p className="text-2xl text-gray-600 font-light mb-3">
                        لا يوجد تذاكر قيد الخدمة حالياً
                      </p>
                      <p className="text-base text-gray-400 mb-5">سيتم عرض التذاكر الجديدة هنا</p>

                      <motion.div
                        className="w-48 h-1 bg-blue-100 rounded-full mx-auto overflow-hidden"
                        initial={{ width: 0 }}
                        animate={{ width: 192 }}
                        transition={{ duration: 1.5 }}
                      >
                        <motion.div
                          className="h-full bg-blue-500 rounded-full"
                          animate={{ x: ['-100%', '100%'] }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: 'easeInOut'
                          }}
                        />
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="w-full mt-1">
            <h3 className="text-base font-medium text-gray-500 mb-2 grid grid-flow-col auto-cols-max gap-1 items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>التذاكر السابقة</span>
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {recentlyServed.length > 0 ? (
                recentlyServed.slice(0, 3).map((ticket, index) => {
                  const serviceInfoData = getServiceInfo(ticket.serviceType)
                  return (
                    <motion.div
                      key={`recent-${ticket.id}-${index}`}
                      className={`bg-white rounded-xl shadow-sm overflow-hidden border ${serviceInfoData.outlineColor}`}
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.15 }}
                      whileHover={{ y: -3, transition: { duration: 0.2 } }}
                    >
                      <div
                        className={`bg-gradient-to-r ${serviceInfoData.gradient} px-3 py-2 grid grid-cols-[1fr,auto] items-center text-white`}
                      >
                        <div className="grid grid-flow-col auto-cols-max gap-1 items-center">
                          <span className="text-lg">{serviceInfoData.icon}</span>
                          <div className="text-xs">{serviceInfoData.name}</div>
                        </div>
                        <div className="bg-white/20 px-2 py-1 rounded-md text-xs">تذكرة رقم</div>
                      </div>
                      <div className="p-3 text-center">
                        <div
                          className={`text-4xl font-bold bg-gradient-to-br ${serviceInfoData.gradient} bg-clip-text text-transparent mb-2`}
                        >
                          {ticket.id}
                        </div>
                        <div className="text-sm text-gray-600 grid grid-flow-col auto-cols-max gap-1 items-center justify-center bg-gray-50 py-1 px-2 rounded-lg">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                            />
                          </svg>
                          <span>المكتب {ticket.counterNumber}</span>
                        </div>
                      </div>
                    </motion.div>
                  )
                })
              ) : (
                <div className="col-span-3 bg-white rounded-xl shadow-sm p-4 text-center text-gray-500 text-base border border-gray-100 grid place-items-center">
                  <div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-12 w-12 mx-auto mb-3 text-gray-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                    <p>لا توجد تذاكر سابقة</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-full">
            <motion.div
              className="bg-white rounded-xl shadow-sm p-3 border border-slate-100 grid grid-flow-col auto-cols-max gap-3 items-center justify-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="grid grid-flow-col auto-cols-max gap-1 items-center bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                <span className="font-medium">عدد التذاكر في الانتظار</span>
              </div>
              <motion.div
                key={`waiting-count-${waitingCount}`}
                className="text-2xl font-bold text-gray-700"
                initial={{ scale: 1 }}
                animate={{
                  scale: [1, 1.1, 1],
                  color: waitingCount > 10 ? ['#374151', '#ef4444', '#374151'] : undefined
                }}
                transition={{ duration: 0.5 }}
              >
                {waitingCount}
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
