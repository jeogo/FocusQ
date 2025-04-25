/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueue } from '../context/QueueContext'

type EmployeeScreenProps = {
  counterId?: number // Optional prop to specify counter ID
}

// Add a static variable to keep track of the next available index
let nextEmployeeIndex = 1;

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

  const sessionIndex = useRef<number>(nextEmployeeIndex++);

  const getCounterIdFromUrl = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const counterParam = urlParams.get('counter')
    const hashCounter = window.location.hash.match(/#employee\/(\d+)/)

    if (propCounterId) return propCounterId
    if (counterParam) return parseInt(counterParam, 10)
    if (hashCounter) return parseInt(hashCounter[1], 10)

    const savedCounter = localStorage.getItem(`employeeCounter_${sessionIndex.current}`)
    if (savedCounter) return parseInt(savedCounter, 10)

    return null
  }, [propCounterId]);

  const [counterIdFromUrl, setCounterIdFromUrl] = useState<number | null>(() => getCounterIdFromUrl());
  const [isInitializing, setIsInitializing] = useState(true)
  const [elapsedTime, setElapsedTime] = useState('00:00')
  const [startTime, setStartTime] = useState<number | null>(null)
  const [counterStatus, setCounterStatus] = useState<'active' | 'inactive'>('active')
  const [showStatusMessage, setShowStatusMessage] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isAssigningCounter, setIsAssigningCounter] = useState(false)
  const pollingActive = useRef(true)
  const isComponentMounted = useRef(true)

  const currentCounter = useMemo(() =>
    queueState?.counters?.find((c) => c.id === counterIdFromUrl) || null
  , [queueState?.counters, counterIdFromUrl]);

  const isBusy = useMemo(() => currentCounter?.busy || false, [currentCounter]);

  const ticketsWaiting = useMemo(() =>
    queueState?.tickets?.filter((t) => t.status === 'waiting').length || 0
  , [queueState?.tickets]);

  const currentTicket = useMemo(() =>
    currentCounter && currentCounter.currentTicket
      ? queueState?.tickets?.find((t) => t.id === currentCounter.currentTicket)
      : null
  , [currentCounter, queueState?.tickets]);

  const autoAssignCounter = useCallback((counters) => {
    if (!counters || counters.length === 0) return null

    const availableCounters = counters.filter((c) => c.status === 'active' && !c.busy)
    if (availableCounters.length === 0) {
      const activeCounters = counters.filter(c => c.status === 'active')
      return activeCounters.length > 0 ? activeCounters[0].id : counters[0].id
    }

    const activeCounterSessions = {}
    const counterSessionPrefix = 'counter_session_'

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(counterSessionPrefix)) {
        const counterId = key.replace(counterSessionPrefix, '')
        const sessionData = localStorage.getItem(key)

        if (sessionData) {
          try {
            const { timestamp, session } = JSON.parse(sessionData)
            if (Date.now() - timestamp < 2 * 60 * 1000 && session !== sessionIndex.current) {
              activeCounterSessions[counterId] = true
            } else if (Date.now() - timestamp >= 2 * 60 * 1000) {
              localStorage.removeItem(key)
            }
          } catch (error) {
            localStorage.removeItem(key)
          }
        }
      }
    }

    const unusedCounter = availableCounters.find((c) => !activeCounterSessions[c.id])
    if (unusedCounter) {
      return unusedCounter.id
    }

    return availableCounters[0].id
  }, []);

  const markCounterInUse = useCallback((counterId) => {
    if (!counterId) return;

    const counterSessionKey = `counter_session_${counterId}`
    const sessionData = {
      timestamp: Date.now(),
      session: sessionIndex.current
    }

    localStorage.setItem(counterSessionKey, JSON.stringify(sessionData))
    localStorage.setItem(`employeeCounter_${sessionIndex.current}`, counterId.toString())

    const intervalId = window.setInterval(() => {
      if (isComponentMounted.current) {
        sessionData.timestamp = Date.now()
        localStorage.setItem(counterSessionKey, JSON.stringify(sessionData))
      }
    }, 60 * 1000)

    const handleUnload = () => {
      localStorage.removeItem(counterSessionKey)
    }

    window.addEventListener('beforeunload', handleUnload)

    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      clearInterval(intervalId)
      if (isComponentMounted.current) {
        localStorage.removeItem(counterSessionKey)
      }
    }
  }, []);

  const handleRefreshQueueState = useCallback(async () => {
    try {
      await contextRefreshQueueState();
    } catch (error) {
      console.error('Error refreshing queue state:', error)
    }
  }, [contextRefreshQueueState]);

  useEffect(() => {
    isComponentMounted.current = true
    setIsInitializing(true)

    handleRefreshQueueState().then(() => {
      if (isComponentMounted.current) {
        setIsInitializing(false)
      }
    })

    return () => {
      isComponentMounted.current = false
    }
  }, [handleRefreshQueueState])

  // Handle reconnection attempts when connection is lost
  useEffect(() => {
    if (!isConnected) {
      const attemptReconnect = async () => {
        try {
          await reconnectServer();
          if (isComponentMounted.current) {
            console.log('Reconnection successful');
          }
        } catch (error) {
          console.error('Error during reconnection attempt:', error);
          // Schedule next reconnection attempt if component is still mounted
          if (isComponentMounted.current) {
            setTimeout(attemptReconnect, 5000);
          }
        }
      };

      // Start reconnection process
      attemptReconnect();
    }
  }, [isConnected, reconnectServer]);

  useEffect(() => {
    if (!counterIdFromUrl &&
        queueState?.counters &&
        queueState.counters.length > 0 &&
        !isAssigningCounter &&
        isComponentMounted.current) {

      const assignCounter = async () => {
        setIsAssigningCounter(true);
        try {
          const assignedCounterId = autoAssignCounter(queueState.counters);
          if (assignedCounterId && isComponentMounted.current) {
            setCounterIdFromUrl(assignedCounterId);

            // لا تقم بتغيير عنوان الصفحة أو إعادة تحميلها
            // فقط حدث العنوان في التاب نفسه
            document.title = `شاشة الموظف - مكتب ${assignedCounterId} - FocusQ`;

            showStatus(`تم تعيين المكتب ${assignedCounterId} تلقائياً`);
          }
        } finally {
          if (isComponentMounted.current) {
            setIsAssigningCounter(false);
          }
        }
      };

      assignCounter();
    }
  }, [queueState?.counters, counterIdFromUrl, isAssigningCounter, autoAssignCounter]);

  useEffect(() => {
    if (!counterIdFromUrl) return;

    const cleanup = markCounterInUse(counterIdFromUrl);

    return cleanup;
  }, [counterIdFromUrl, markCounterInUse]);

  useEffect(() => {
    if (!startTime) return;

    const timer = setInterval(() => {
      if (!isComponentMounted.current) return;

      const elapsed = Date.now() - startTime;
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);

      const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

      if (isComponentMounted.current && timeString !== elapsedTime) {
        setElapsedTime(timeString);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime, elapsedTime]);

  useEffect(() => {
    if (!pollingActive.current || isLoading) return;

    let timerId: number | null = null;

    const getPollingInterval = () => {
      // Use longer polling intervals to reduce load
      if (isConnected) {
        return currentCounter?.busy ? 45000 : 45000; // 45s when connected
      }
      return currentCounter?.busy ? 15000 : 15000; // 15s when not connected
    };

    const doPoll = () => {
      if (!document.hidden && !isLoading && isComponentMounted.current && !isConnected) {
        handleRefreshQueueState();
      }
      if (isComponentMounted.current) {
        timerId = window.setTimeout(doPoll, getPollingInterval());
      }
    };

    timerId = window.setTimeout(doPoll, getPollingInterval());

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [isLoading, handleRefreshQueueState, currentCounter, isConnected]);

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

  const handleCallNext = async () => {
    if (!counterIdFromUrl) return

    try {
      const result = await callNextCustomer(counterIdFromUrl)
      if (result) {
        showStatus('تم استدعاء العميل التالي بنجاح')
        // لا تقم بتغيير عنوان الصفحة أو إعادة تحميلها هنا
        // فقط قم بتحديث الحالة إذا لزم الأمر
      } else {
        showStatus('لا يوجد عملاء في الانتظار')
      }
    } catch (error) {
      console.error('Error calling next customer:', error)
      showStatus('حدث خطأ أثناء استدعاء العميل التالي')
    }
  }

  const handleCompleteService = async () => {
    if (!counterIdFromUrl) return

    try {
      await completeService(counterIdFromUrl)
      showStatus('تم إنهاء الخدمة بنجاح')

      setStartTime(null)
      setElapsedTime('00:00')
    } catch (error) {
      console.error('Error completing service:', error)
      showStatus('حدث خطأ أثناء إنهاء الخدمة')
    }
  }

  const handleReassignCounter = async () => {
    if (counterIdFromUrl) {
      localStorage.removeItem(`counter_session_${counterIdFromUrl}`)
    }

    setIsAssigningCounter(true)

    if (queueState && queueState.counters) {
      const assignedCounterId = autoAssignCounter(queueState.counters)
      if (assignedCounterId) {
        setCounterIdFromUrl(assignedCounterId)

        // لا تقم بتغيير عنوان الصفحة أو إعادة تحميلها
        document.title = `شاشة الموظف - مكتب ${assignedCounterId} - FocusQ`

        showStatus(`تم تعيين المكتب ${assignedCounterId} تلقائياً`)
      } else {
        showStatus('لا توجد مكاتب متاحة للتعيين')
      }
    }

    setIsAssigningCounter(false)
  }

  const toggleCounterStatus = async () => {
    if (!counterIdFromUrl) return

    const newStatus = counterStatus === 'active' ? 'inactive' : 'active'
    try {
      await updateCounterStatus(counterIdFromUrl, newStatus)
      setCounterStatus(newStatus)
      showStatus(`تم تغيير حالة المكتب إلى ${newStatus === 'active' ? 'نشط' : 'غير نشط'}`)
    } catch (error) {
      console.error('Error updating counter status:', error)
      showStatus('حدث خطأ أثناء تحديث حالة المكتب')
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
      <div className="h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <div className="flex flex-col items-center bg-white p-8 rounded-2xl shadow-lg">
          <div className="relative w-16 h-16 mb-3">
            <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-200 rounded-full"></div>
            <div className="absolute top-0 left-0 w-full h-full border-4 border-t-blue-600 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-lg text-gray-600 font-medium">
            {isAssigningCounter ? 'جاري تعيين مكتب تلقائياً...' : 'جاري تهيئة النظام...'}
          </p>
        </div>
      </div>
    )
  }

  if (!queueState) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <div className="flex flex-col items-center">
          <div className="relative w-16 h-16 mb-3">
            <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-200 rounded-full"></div>
            <div className="absolute top-0 left-0 w-full h-full border-4 border-t-blue-600 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-lg text-gray-600 font-medium">جاري تحميل البيانات...</p>
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-6" dir="rtl">
      {/* Show connection status indicator */}
      {!isConnected && (
        <div className="fixed top-4 right-4 bg-red-100 text-red-800 px-4 py-2 rounded-lg shadow-md flex items-center z-50">
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
            className="ml-3 text-xs bg-red-200 hover:bg-red-300 px-2 py-1 rounded transition-colors"
          >
            إعادة الاتصال
          </button>
        </div>
      )}

      <div className="max-w-5xl mx-auto">
        <header className="mb-6 flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-3 md:mb-0">
            <div
              className={`w-12 h-12 mr-3 rounded-xl flex items-center justify-center text-white ${
                counterStatus === 'active' ? 'bg-blue-600' : 'bg-gray-400'
              }`}
            >
              <span className="text-2xl font-bold">{counterIdFromUrl}</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">المكتب {counterIdFromUrl}</h1>
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
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'bg-green-50 text-green-600 hover:bg-green-100'
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
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors flex items-center"
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
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 border border-gray-100">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white">
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
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 text-center">
                  <p className="text-gray-700 mb-1">عدد العملاء في الانتظار</p>
                  <p className="text-5xl font-bold text-blue-700">{ticketsWaiting}</p>
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
                    className="w-full mt-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-base font-medium hover:from-blue-700 hover:to-blue-800 shadow-sm transition-all flex items-center justify-center"
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

            <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white">
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
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                    />
                  </svg>
                  إحصائيات
                </h2>
              </div>
              <div className="p-5">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">الوقت المستغرق للعميل الحالي</span>
                    <span className="text-lg font-medium text-blue-700">
                      {isBusy ? elapsedTime : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">حالة المكتب</span>
                    <span
                      className={`px-2 py-1 rounded-md text-sm font-medium ${
                        counterStatus === 'active'
                          ? isBusy
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {counterStatus === 'active' ? (isBusy ? 'مشغول' : 'متاح') : 'غير نشط'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 border border-gray-100">
              <div
                className={`p-5 flex justify-between items-center ${
                  isBusy
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white'
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
                        <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center text-3xl">
                          {getServiceTypeIcon(currentTicket.serviceType)}
                        </div>
                      </div>
                      <h3 className="text-lg text-gray-700 font-medium">
                        {getServiceTypeName(currentTicket.serviceType)}
                      </h3>
                    </div>

                    <div className="bg-blue-50 py-6 px-4 rounded-2xl mb-6 flex flex-col items-center">
                      <div className="text-sm text-blue-600 mb-1">رقم التذكرة</div>
                      <div className="text-6xl font-bold text-blue-700 mb-2">
                        {currentTicket.id}
                      </div>
                      <div className="text-sm text-gray-500">بدأت الخدمة منذ {elapsedTime}</div>
                    </div>

                    <motion.button
                      onClick={handleCompleteService}
                      className="py-3 px-6 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl text-lg font-medium hover:from-green-700 hover:to-green-800 shadow-md transition-all flex items-center justify-center mx-auto"
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
                            يوجد {ticketsWaiting} عملاء في انتظار الخدمة
                          </p>
                          <motion.button
                            onClick={handleCallNext}
                            className="py-3 px-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl text-lg font-medium hover:from-blue-700 hover:to-blue-800 shadow-md transition-all flex items-center justify-center mx-auto"
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
                      <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg inline-flex items-start">
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

            <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
              <div className="p-5 border-b border-gray-100">
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

        <footer className="mt-8 text-center text-gray-500 text-sm">
          جميع الحقوق محفوظة © {new Date().getFullYear()}
        </footer>
      </div>

      <AnimatePresence>
        {showStatusMessage && (
          <motion.div
            className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg z-50"
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
