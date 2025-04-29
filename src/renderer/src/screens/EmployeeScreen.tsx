/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueue } from '../context/QueueContext'
import * as SocketClient from '../services/socket/client'
import { formatUtils } from '../services/QueueService';
import Logo from '../components/Logo'

// Generate a unique session ID for this browser tab/window
const BROWSER_SESSION_ID = Math.random().toString(36).substring(2, 15);

// Create a global counter tracker in localStorage

// Cleanup function to remove this counter ID from tracking
function cleanupCounterId() {
  try {
    const counterKey = 'focusq_counter_tracker';
    const countersData = localStorage.getItem(counterKey);
    if (countersData) {
      let counters = JSON.parse(countersData);
      // Remove this session's counter
      counters = counters.filter(c => c.sessionId !== BROWSER_SESSION_ID);
      localStorage.setItem(counterKey, JSON.stringify(counters));
    }
  } catch (error) {
    console.error('Error cleaning up counter ID:', error);
  }
}

// Check if we already have a counter ID in this session

type EmployeeScreenProps = {
  counterId?: number // Optional prop to specify counter ID
}

export default function EmployeeScreen({ counterId: propCounterId }: EmployeeScreenProps) {
  const {
    queueState,
    callNextCustomer,
    completeService,
    updateCounterStatus,
    refreshQueueState: contextRefreshQueueState,
    isLoading,
    isConnected,
    reconnectServer
  } = useQueue()

  const sessionIndex = useRef<number>(1);
  // Track server-assigned counter ID
  const [serverAssignedCounterId, setServerAssignedCounterId] = useState<number | null>(null);
  // Counter ID from URL or other sources
  const [counterIdFromUrl, setCounterIdFromUrl] = useState<number | null>(null);
  // Actual counter ID to use in the component
  const [activeCounterId, setActiveCounterId] = useState<number | null>(null);

  const [isInitializing, setIsInitializing] = useState(true)
  const [elapsedTime, setElapsedTime] = useState('00:00')
  const [startTime, setStartTime] = useState<number | null>(null)
  const [counterStatus, setCounterStatus] = useState<'active' | 'inactive'>('active')
  const [showStatusMessage, setShowStatusMessage] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isAssigningCounter, setIsAssigningCounter] = useState(false)
  const isComponentMounted = useRef(true)

  // Get counter ID from URL parameters or hash
  const getCounterIdFromUrl = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const counterParam = urlParams.get('counter')
    const hashCounter = window.location.hash.match(/#employee\/(\d+)/)

    // If counter ID was explicitly provided as a prop, use it
    if (propCounterId) return propCounterId

    // If counter parameter exists and has a numeric value, use it
    if (counterParam && !isNaN(parseInt(counterParam, 10)))
      return parseInt(counterParam, 10)

    // If counter parameter exists but has no value, return null
    if (counterParam === '')
      return null

    // Try to get counter ID from URL hash
    if (hashCounter) return parseInt(hashCounter[1], 10)

    // No counter ID found, return null
    return null;
  }, [propCounterId]);

  // Initialize counter ID from URL on mount
  useEffect(() => {
    const urlCounterId = getCounterIdFromUrl();
    setCounterIdFromUrl(urlCounterId);
  }, [getCounterIdFromUrl]);

  // Set page title based on counter ID
  useEffect(() => {
    if (activeCounterId) {
      document.title = `شاشة الموظف - مكتب ${activeCounterId} - FocusQ`;
    }
  }, [activeCounterId]);

  // Find current counter in queue state
  const currentCounter = useMemo(() =>
    queueState?.counters?.find((c) => c.id === activeCounterId) || null
  , [queueState?.counters, activeCounterId]);

  const isBusy = useMemo(() => currentCounter?.busy || false, [currentCounter]);

  const ticketsWaiting = useMemo(() =>
    queueState?.tickets?.filter((t) => t.status === 'waiting').length || 0
  , [queueState?.tickets]);

  const currentTicket = useMemo(() =>
    currentCounter && currentCounter.currentTicket
      ? queueState?.tickets?.find((t) => t.id === currentCounter.currentTicket)
      : null
  , [currentCounter, queueState?.tickets]);

  // Helper function to show status messages
  const showStatus = useCallback((message: string) => {
    setStatusMessage(message)
    setShowStatusMessage(true)

    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current)
    }

    statusTimerRef.current = setTimeout(() => {
      setShowStatusMessage(false)
    }, 3000)
  }, []);

  // Register with server and listen for counter ID assignment
  useEffect(() => {
    if (!isConnected) return;

    console.log('[EmployeeScreen] Connected to server, registering as employee screen');

    // Register this screen as an employee screen
    SocketClient.registerAsEmployeeScreen();

    // Listen for counter ID assignment from server
    const unsubscribe = SocketClient.listenForCounterId((counterId: number) => {
      console.log(`[EmployeeScreen] Received counter ID from server: ${counterId}`);
      setServerAssignedCounterId(counterId);
    });

    return unsubscribe;
  }, [isConnected]);

  // Determine the active counter ID to use
  useEffect(() => {
    // Priority order: server-assigned ID > URL/prop ID
    if (serverAssignedCounterId !== null) {
      console.log(`[EmployeeScreen] Using server-assigned counter ID: ${serverAssignedCounterId}`);
      setActiveCounterId(serverAssignedCounterId);
      showStatus(`تم تعيين المكتب ${serverAssignedCounterId} من الخادم`);
    } else if (counterIdFromUrl !== null) {
      console.log(`[EmployeeScreen] Using counter ID from URL/props: ${counterIdFromUrl}`);
      setActiveCounterId(counterIdFromUrl);
    }
  }, [serverAssignedCounterId, counterIdFromUrl, showStatus]);

  // Handle manual reconnection when connection is lost
  useEffect(() => {
    if (!isConnected) {
      const attemptReconnect = async () => {
        try {
          await reconnectServer();
          if (isComponentMounted.current) {
            console.log('[EmployeeScreen] Reconnection successful');
            // Re-register as employee screen after reconnection
            SocketClient.registerAsEmployeeScreen();
          }
        } catch (error) {
          console.error('[EmployeeScreen] Error during reconnection attempt:', error);
          if (isComponentMounted.current) {
            setTimeout(attemptReconnect, 5000);
          }
        }
      };

      attemptReconnect();
    }
  }, [isConnected, reconnectServer]);

  // Mark counter as in use
  useEffect(() => {
    if (!activeCounterId) return;

    const counterSessionKey = `counter_session_${activeCounterId}`;
    const sessionData = {
      timestamp: Date.now(),
      session: sessionIndex.current
    };

    localStorage.setItem(counterSessionKey, JSON.stringify(sessionData));
    localStorage.setItem(`employeeCounter_${sessionIndex.current}`, activeCounterId.toString());

    // Keep updating the timestamp to show this counter is still in use
    const intervalId = window.setInterval(() => {
      if (isComponentMounted.current) {
        sessionData.timestamp = Date.now();
        localStorage.setItem(counterSessionKey, JSON.stringify(sessionData));
      }
    }, 60 * 1000);

    const handleUnload = () => {
      localStorage.removeItem(counterSessionKey);
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      clearInterval(intervalId);
      if (isComponentMounted.current) {
        localStorage.removeItem(counterSessionKey);
      }
    };
  }, [activeCounterId]);

  // Handle refresh queue state
  const handleRefreshQueueState = useCallback(async () => {
    try {
      await contextRefreshQueueState();
    } catch (error) {
      console.error('[EmployeeScreen] Error refreshing queue state:', error)
    }
  }, [contextRefreshQueueState]);

  // Initialize component
  useEffect(() => {
    isComponentMounted.current = true;
    setIsInitializing(true);

    handleRefreshQueueState().then(() => {
      if (isComponentMounted.current) {
        setIsInitializing(false);
      }
    });

    return () => {
      isComponentMounted.current = false;
    };
  }, [handleRefreshQueueState]);

  // Handle call next customer
  const handleCallNext = async () => {
    if (!activeCounterId) return;

    try {
      console.log(`[EmployeeScreen] Calling next customer from counter ${activeCounterId}`);
      // تأكد من أن معرف المكتب المستخدم هو رقم صحيح
      const numericCounterId = parseInt(String(activeCounterId), 10);

      if (isNaN(numericCounterId) || numericCounterId <= 0) {
        console.error(`[EmployeeScreen] Invalid counter ID: ${activeCounterId}`);
        showStatus('حدث خطأ: رقم المكتب غير صحيح');
        return;
      }

      // عرض حالة طلب قيد التنفيذ
      showStatus('جاري استدعاء العميل...');

      const result = await callNextCustomer(numericCounterId);
      console.log(`[EmployeeScreen] Call next customer result:`, result);

      if (result) {
        showStatus('تم استدعاء العميل التالي بنجاح');

        // تعيين وقت البدء بمجرد مناداة العميل بنجاح
        setStartTime(Date.now());

        // تحديث حالة القائمة للتأكد من أن التغييرات تنعكس على الواجهة
        setTimeout(() => handleRefreshQueueState(), 500);
      } else {
        console.warn(`[EmployeeScreen] No success in call next customer response:`, result);
        showStatus('لا يوجد عملاء في الانتظار');
      }
    } catch (error) {
      console.error('[EmployeeScreen] Error calling next customer:', error);
      showStatus('حدث خطأ أثناء استدعاء العميل التالي');

      // محاولة تحديث حالة القائمة بعد الخطأ
      setTimeout(() => handleRefreshQueueState(), 1000);
    }
  };

  // Handle complete service with error handling
  const handleCompleteService = async () => {
    if (!activeCounterId) return;

    try {
      // تأكد من أن معرف المكتب المستخدم هو رقم صحيح
      const numericCounterId = parseInt(String(activeCounterId), 10);

      if (isNaN(numericCounterId) || numericCounterId <= 0) {
        console.error(`[EmployeeScreen] Invalid counter ID in completeService: ${activeCounterId}`);
        showStatus('حدث خطأ: رقم المكتب غير صحيح');
        return;
      }

      // تأكد من أن المكتب مشغول حاليًا قبل محاولة إنهاء الخدمة
      if (!isBusy || !currentTicket) {
        console.warn(`[EmployeeScreen] Attempted to complete service for counter ${numericCounterId} with no active ticket`);
        showStatus('لا يوجد عميل حالي لإنهاء خدمته');
        return;
      }

      // عرض حالة طلب قيد التنفيذ
      showStatus('جاري إنهاء الخدمة...');

      const result = await completeService(numericCounterId);
      console.log(`[EmployeeScreen] Complete service result:`, result);

      // إعادة تعيين الحالة بعد إنهاء الخدمة بنجاح
      setStartTime(null);
      setElapsedTime('00:00');

      showStatus('تم إنهاء الخدمة بنجاح');

      // تحديث حالة القائمة للتأكد من أن التغييرات تنعكس على الواجهة
      setTimeout(() => handleRefreshQueueState(), 500);
    } catch (error) {
      console.error('[EmployeeScreen] Error completing service:', error);

      // Check for specific ticket ownership error messages
      if (error instanceof Error && error.message.includes('غير مسموح بإنهاء خدمة')) {
        showStatus(error.message);
      } else {
        showStatus('حدث خطأ أثناء إنهاء الخدمة');
      }

      // محاولة تحديث حالة القائمة بعد الخطأ
      setTimeout(() => handleRefreshQueueState(), 1000);
    }
  };

  // Handle counter status toggle
  const toggleCounterStatus = async () => {
    if (!activeCounterId) return;

    const newStatus = counterStatus === 'active' ? 'inactive' : 'active';
    try {
      await updateCounterStatus(activeCounterId, newStatus);
      setCounterStatus(newStatus);
      showStatus(`تم تغيير حالة المكتب إلى ${newStatus === 'active' ? 'نشط' : 'غير نشط'}`);
    } catch (error) {
      console.error('[EmployeeScreen] Error updating counter status:', error);
      showStatus('حدث خطأ أثناء تحديث حالة المكتب');
    }
  }

  const getServiceTypeName = (type: string | undefined) => {
    if (!type) return ''

    const types = {
      general: 'الخدمات العامة',
      financial: 'الخدمات المالية',
      technical: 'الدعم الفني'
    }

    return types[type as keyof typeof types] || type
  }

  const getServiceTypeIcon = (type: string | undefined) => {
    if (!type) return ''

    const icons = {
      general: '👥',
      financial: '💰',
      technical: '🔧'
    }

    return icons[type as keyof typeof icons] || '🔹'
  }

  if (isInitializing || isAssigningCounter || isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center bg-white p-8 rounded-2xl shadow-md">
          <Logo className="w-24 h-24 mb-6" />
          <div className="relative w-16 h-16 mb-3">
            <div className="absolute top-0 left-0 w-full h-full border-4 border-gray-200 rounded-full"></div>
            <div className="absolute top-0 left-0 w-full h-full border-4 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-lg text-gray-700 font-medium">
            {isAssigningCounter ? 'جاري تعيين مكتب تلقائياً...' : 'جاري تهيئة النظام...'}
          </p>
        </div>
      </div>
    )
  }

  if (!queueState) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center">
          <Logo className="w-24 h-24 mb-6" />
          <div className="relative w-16 h-16 mb-3">
            <div className="absolute top-0 left-0 w-full h-full border-4 border-gray-200 rounded-full"></div>
            <div className="absolute top-0 left-0 w-full h-full border-4 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-lg text-gray-700 font-medium">جاري تحميل البيانات...</p>
          <button
            onClick={() => contextRefreshQueueState()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    )
  }

  function handleReassignCounter(event: React.MouseEvent<HTMLButtonElement>): void {
    throw new Error('Function not implemented.');
  }

  return (
    <div className="min-h-screen bg-white p-4 md:p-6" dir="rtl">
      {/* Show connection status indicator with counter ID info */}
      {!isConnected ? (
        <div className="fixed top-4 right-4 bg-white border border-red-200 text-red-600 px-4 py-2 rounded-lg shadow-sm flex items-center z-50">
          <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span>انقطع الاتصال بالخادم</span>
          <button
            onClick={() => reconnectServer()}
            className="ml-3 text-xs bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors"
          >
            إعادة الاتصال
          </button>
        </div>
      ) : (
        <div className="fixed top-4 right-4 bg-white border border-green-200 text-green-600 px-4 py-2 rounded-lg shadow-sm flex items-center z-50">
          <div className="w-2 h-2 rounded-full bg-green-500 mr-1"></div>
          <span>متصل بالخادم</span>
          <span className="mx-2 text-xs text-gray-400">|</span>
          <span className="text-sm">مكتب رقم: {activeCounterId}</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto">
        <header className="mb-6 flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-3 md:mb-0">
            <Logo className="w-12 h-12 mr-4" />
            <div
              className={`w-12 h-12 mr-3 rounded-xl flex items-center justify-center text-white ${
                counterStatus === 'active' ? 'bg-blue-500' : 'bg-gray-400'
              }`}
            >
              <span className="text-2xl font-bold">{activeCounterId}</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">المكتب {activeCounterId}</h1>
              <div className="flex items-center">
                <div
                  className={`w-2 h-2 rounded-full mr-1 ${
                    counterStatus === 'active' ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                ></div>
                <span className="text-sm text-gray-500">
                  {counterStatus === 'active' ? 'نشط' : 'غير نشط'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <motion.button
              onClick={toggleCounterStatus}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center ${
                counterStatus === 'active'
                  ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'
                  : 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-100'
              }`}
              whileTap={{ scale: 0.97 }}
            >
              <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d={
                    counterStatus === 'active'
                      ? 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z'
                      : 'M5 13l4 4L19 7'
                  }
                />
              </svg>
              {counterStatus === 'active' ? 'إيقاف المكتب' : 'تنشيط المكتب'}
            </motion.button>

            <motion.button
              onClick={handleReassignCounter}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors flex items-center border border-blue-100"
              whileTap={{ scale: 0.97 }}
            >
              <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              تغيير المكتب
            </motion.button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6 border border-gray-200">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-5 text-white">
                <h2 className="text-xl font-bold flex items-center">
                  <svg
                    className="h-5 w-5 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  حالة الانتظار
                </h2>
              </div>
              <div className="p-5">
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-gray-700 mb-1">عدد العملاء في الانتظار</p>
                  <p className="text-5xl font-bold text-blue-600">{ticketsWaiting}</p>
                  <p className="text-sm text-gray-500 mt-2">
                    {ticketsWaiting === 0
                      ? 'لا يوجد عملاء في الانتظار'
                      : ticketsWaiting === 1
                        ? 'عميل واحد ينتظر'
                        : `${ticketsWaiting} عملاء ينتظرون`}
                  </p>
                </div>

                {ticketsWaiting > 0 && counterStatus === 'active' && !isBusy && (
                  <motion.button
                    onClick={handleCallNext}
                    className="w-full mt-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg text-base font-medium hover:from-blue-600 hover:to-blue-700 shadow-sm transition-all flex items-center justify-center"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg
                      className="h-5 w-5 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                      />
                    </svg>
                    استدعاء العميل التالي
                  </motion.button>
                )}
              </div>
            </div>

           
          </div>

          <div className="md:col-span-2">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6 border border-gray-200">
              <div
                className={`p-5 flex justify-between items-center ${
                  isBusy
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                <h2 className="text-xl font-bold">الخدمة الحالية</h2>
                <div
                  className={`px-3 py-1 rounded-full text-sm ${
                    isBusy ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {isBusy ? 'جاري الخدمة' : 'لا يوجد عميل حالياً'}
                </div>
              </div>

              <div className="p-6">
                {isBusy && currentTicket ? (
                  <div className="text-center">
                    <div className="mb-6">
                      <div className="inline-flex rounded-full bg-blue-50 p-3 mb-3">
                        <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center text-3xl text-blue-700">
                          {getServiceTypeIcon(currentTicket.serviceType)}
                        </div>
                      </div>
                      <h3 className="text-lg text-gray-700 font-medium">
                        {getServiceTypeName(currentTicket.serviceType)}
                      </h3>
                    </div>

                    <div className="bg-blue-50 py-6 px-4 rounded-xl mb-6 flex flex-col items-center border border-blue-100">
                      <div className="text-sm text-blue-600 mb-1">رقم التذكرة</div>
                      <div className="text-6xl font-bold text-blue-600 mb-2">
                        {currentTicket.id}
                      </div>
                      <div className="text-sm text-gray-500">بدأت الخدمة منذ {elapsedTime}</div>
                    </div>

                    <motion.button
                      onClick={handleCompleteService}
                      className="py-3 px-6 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl text-lg font-medium hover:from-green-600 hover:to-green-700 shadow-md transition-all flex items-center justify-center mx-auto"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <svg
                        className="h-5 w-5 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      إنهاء الخدمة
                    </motion.button>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <motion.div
                      className="w-24 h-24 mx-auto mb-6 rounded-full bg-gray-100 flex items-center justify-center"
                      animate={{
                        scale: [1, 1.05, 1],
                        opacity: [0.7, 0.9, 0.7]
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        repeatType: 'mirror'
                      }}
                    >
                      <svg
                        className="h-12 w-12 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </motion.div>

                    <h3 className="text-2xl text-gray-500 font-light mb-3">لا يوجد عميل حالياً</h3>

                    {counterStatus === 'active' ? (
                      ticketsWaiting > 0 ? (
                        <div>
                          <p className="text-gray-500 mb-6">
                            يوجد {formatUtils.formatNumber(ticketsWaiting)} عملاء في انتظار الخدمة
                          </p>
                          <motion.button
                            onClick={handleCallNext}
                            className="py-3 px-6 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl text-lg font-medium hover:from-blue-600 hover:to-blue-700 shadow-md transition-all flex items-center justify-center mx-auto"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <svg
                              className="h-5 w-5 mr-2"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                              />
                            </svg>
                            استدعاء العميل التالي
                          </motion.button>
                        </div>
                      ) : (
                        <p className="text-gray-500">لا يوجد عملاء في الانتظار حالياً</p>
                      )
                    ) : (
                      <div className="bg-yellow-50 text-yellow-700 p-4 rounded-lg inline-flex items-start border border-yellow-200">
                        <svg
                          className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                        <div>
                          <p className="font-medium">المكتب غير نشط حالياً</p>
                          <p className="text-sm mt-1">يرجى تنشيط المكتب لاستقبال العملاء</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
              <div className="p-5 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-800">التعليمات</h2>
              </div>
              <div className="p-5">
                <ul className="space-y-3 text-gray-600">
                  <li className="flex items-start">
                    <svg
                      className="h-5 w-5 text-blue-500 mr-2 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>
                      اضغط على "استدعاء العميل التالي" لاستدعاء العميل التالي في قائمة الانتظار.
                    </span>
                  </li>
                  <li className="flex items-start">
                    <svg
                      className="h-5 w-5 text-blue-500 mr-2 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>اضغط على "إنهاء الخدمة" عند الانتهاء من خدمة العميل الحالي.</span>
                  </li>
                  <li className="flex items-start">
                    <svg
                      className="h-5 w-5 text-blue-500 mr-2 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>يمكنك إيقاف المكتب مؤقتاً من خلال زر "إيقاف المكتب" في الأعلى.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-8 text-center text-gray-400 text-sm">
          <Logo className="w-10 h-10 mx-auto mb-2 opacity-30" />
          جميع الحقوق محفوظة © {new Date().getFullYear()}
        </footer>
      </div>

      <AnimatePresence>
        {showStatusMessage && (
          <motion.div
            className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white border border-gray-200 text-gray-800 px-4 py-2 rounded-lg shadow-lg z-50"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            {statusMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
