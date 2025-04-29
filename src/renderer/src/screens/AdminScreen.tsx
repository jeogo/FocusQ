import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQueue } from '../context/QueueContext'
import ConnectionStatus from '../components/ConnectionStatus'
import { motion, AnimatePresence } from 'framer-motion'
import * as QueueService from '../services/QueueService'
import { formatUtils } from '../services/QueueService'

// تعريف نوع الخدمة
interface Service {
  id: number
  name: string
  type: string
}

export default function AdminScreen() {
  const { queueState, refreshQueueState, isLoading } = useQueue()
  const [dataTimestamp, setDataTimestamp] = useState<string>('')
  const [statsExpanded, setStatsExpanded] = useState<boolean>(true)
  const [servicesExpanded, setServicesExpanded] = useState<boolean>(true)
  const [dailyStatsExpanded, setDailyStatsExpanded] = useState<boolean>(true)
  const [services, setServices] = useState<Service[]>([])
  const [isLoadingServices, setIsLoadingServices] = useState<boolean>(false)
  const [showAddForm, setShowAddForm] = useState<boolean>(false)
  const [showEditForm, setShowEditForm] = useState<boolean>(false)
  const [currentService, setCurrentService] = useState<Service | null>(null)
  const [formData, setFormData] = useState<{name: string, type: string}>({
    name: '',
    type: ''
  })
  const [statusMessage, setStatusMessage] = useState<{type: 'success' | 'error', text: string} | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [historyFilter, setHistoryFilter] = useState<string>('')

  // إحصائيات الخدمة
  const [serviceStats, setServiceStats] = useState({
    averageWaitTime: 0,
    totalTickets: 0,
    totalCompletedTickets: 0,
    peakHour: '',
    typeCounts: {} as Record<string, number>,
    counterPerformance: [] as { counterNumber: number; ticketsServed: number }[]
  })

  // إحصائيات العد اليومي
  const [dailyStats, setDailyStats] = useState({
    currentTicketNumber: 0,
    lastResetDate: '',
    todayTicketsCount: 0,
    daysActive: 0
  })

  // جلب الخدمات من قاعدة البيانات
  const fetchServices = useCallback(async () => {
    setIsLoadingServices(true)
    try {
      if (window.api && window.api.adminDb) {
        const dbServices = await window.api.adminDb.getServices()
        setServices(dbServices || [])
      } else {
        setStatusMessage({
          type: 'error',
          text: 'تعذر الوصول إلى قاعدة البيانات'
        })
      }
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: 'حدث خطأ أثناء جلب الخدمات'
      })
    } finally {
      setIsLoadingServices(false)
    }
  }, [])

  // إضافة خدمة جديدة
  const handleAddService = async () => {
    if (!formData.name || !formData.type) {
      setStatusMessage({
        type: 'error',
        text: 'يرجى ملء جميع الحقول المطلوبة'
      })
      return
    }
    try {
      if (window.api && window.api.adminDb) {
        await window.api.adminDb.addService(formData.name, formData.type)
        await fetchServices()
        setFormData({ name: '', type: '' })
        setShowAddForm(false)
        setStatusMessage({
          type: 'success',
          text: 'تمت إضافة الخدمة بنجاح'
        })
      }
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: 'حدث خطأ أثناء إضافة الخدمة'
      })
    }
  }

  // تحديث خدمة موجودة
  const handleUpdateService = async () => {
    if (!currentService || !formData.name || !formData.type) {
      setStatusMessage({
        type: 'error',
        text: 'يرجى ملء جميع الحقول المطلوبة'
      })
      return
    }
    try {
      if (window.api && window.api.adminDb) {
        if (typeof window.api.adminDb.updateService === 'function') {
          await window.api.adminDb.updateService(currentService.id, formData.name, formData.type)
        } else {
          await window.api.adminDb.deleteService(currentService.id)
          await window.api.adminDb.addService(formData.name, formData.type)
        }
        await fetchServices()
        setFormData({ name: '', type: '' })
        setCurrentService(null)
        setShowEditForm(false)
        setStatusMessage({
          type: 'success',
          text: 'تم تحديث الخدمة بنجاح'
        })
      }
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: 'حدث خطأ أثناء تحديث الخدمة'
      })
    }
  }

  // حذف خدمة
  const handleDeleteService = async (serviceId: number) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الخدمة؟')) return
    try {
      if (window.api && window.api.adminDb) {
        await window.api.adminDb.deleteService(serviceId)
        await fetchServices()
        setStatusMessage({
          type: 'success',
          text: 'تم حذف الخدمة بنجاح'
        })
      }
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: 'حدث خطأ أثناء حذف الخدمة'
      })
    }
  }

  // تحضير الخدمة للتعديل
  const handleEditService = (service: Service) => {
    setCurrentService(service)
    setFormData({
      name: service.name,
      type: service.type
    })
    setShowEditForm(true)
  }

  // حساب إحصائيات العد اليومي (مربوط مع QueueService)
  const fetchDailyStats = useCallback(() => {
    try {
      const currentNumber = QueueService.getCurrentTicketNumber();
      const lastResetDate = QueueService.getLastResetDate();
      const todayCount = QueueService.getTodayTicketsCount();
      const lastReset = new Date(lastResetDate);
      const today = new Date();
      const diffTime = Math.abs(today.getTime() - lastReset.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setDailyStats({
        currentTicketNumber: currentNumber,
        lastResetDate: lastResetDate,
        todayTicketsCount: todayCount,
        daysActive: diffDays
      });
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: 'Error fetching daily stats'
      });
    }
  }, []);

  // حساب إحصائيات الخدمة (محلي من queueState)
  const calculateServiceStats = useCallback(() => {
    if (!queueState?.tickets) return
    const tickets = queueState.tickets
    const completedTickets = tickets.filter(ticket => ticket.status === 'complete')
    const totalCompletedTickets = completedTickets.length
    const typeCounts: Record<string, number> = {}
    tickets.forEach(ticket => {
      const type = ticket.serviceType || 'unknown'
      typeCounts[type] = (typeCounts[type] || 0) + 1
    })
    let totalWaitTime = 0
    completedTickets.forEach(ticket => {
      if (ticket.timestamp) {
        totalWaitTime += Date.now() - ticket.timestamp
      }
    })
    const averageWaitTime = totalCompletedTickets > 0
      ? totalWaitTime / totalCompletedTickets / 60000
      : 0
    const hourCounts: Record<number, number> = {}
    tickets.forEach(ticket => {
      if (ticket.timestamp) {
        const hour = new Date(ticket.timestamp).getHours()
        hourCounts[hour] = (hourCounts[hour] || 0) + 1
      }
    })
    let peakHour = 0
    let maxTickets = 0
    for (const [hour, count] of Object.entries(hourCounts)) {
      if (count > maxTickets) {
        peakHour = parseInt(hour)
        maxTickets = count
      }
    }
    const counterStats: Record<number, { ticketsCount: number }> = {}
    completedTickets.forEach(ticket => {
      if (ticket.counterNumber) {
        const counterNumber = ticket.counterNumber
        if (!counterStats[counterNumber]) {
          counterStats[counterNumber] = { ticketsCount: 0 }
        }
        counterStats[counterNumber].ticketsCount += 1
      }
    })
    const counterPerformance = Object.entries(counterStats).map(([counterNumber, stats]) => ({
      counterNumber: parseInt(counterNumber),
      ticketsServed: stats.ticketsCount
    }))
    setServiceStats({
      averageWaitTime,
      totalTickets: tickets.length,
      totalCompletedTickets,
      peakHour: `${peakHour}:00 - ${peakHour+1}:00`,
      typeCounts,
      counterPerformance
    })
  }, [queueState])

  // دالة للحصول على لون خلفية نوع الخدمة
  const getServiceTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      'general': 'bg-blue-500',
      'financial': 'bg-green-500',
      'technical': 'bg-purple-500',
      'unknown': 'bg-gray-500'
    }
    return colors[type] || 'bg-gray-500'
  }

  // إخفاء رسالة الحالة بعد 3 ثوان
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => {
        setStatusMessage(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [statusMessage])

  // تحديث البيانات عند تحميل الصفحة أو تحديث الطابور
  useEffect(() => {
    refreshQueueState()
    fetchServices()
    fetchDailyStats()
  }, [refreshQueueState, fetchServices, fetchDailyStats])

  useEffect(() => {
    if (queueState) {
      setDataTimestamp(formatUtils.formatDate(new Date()))
      calculateServiceStats()
      fetchDailyStats()
    }
  }, [queueState, calculateServiceStats, fetchDailyStats])

  function getServiceTypesData() {
    const types = Object.entries(serviceStats.typeCounts).map(([type, count]) => {
      const percentage = serviceStats.totalTickets > 0 
        ? Math.round((count / serviceStats.totalTickets) * 100) 
        : 0;
      return { type, count, percentage };
    });
    return types;
  }

  function getServiceTypeName(type: string): string {
    const serviceTypeNames: Record<string, string> = {
      'general': 'خدمات عامة',
      'financial': 'خدمات مالية',
      'technical': 'خدمات تقنية',
      'unknown': 'غير معروف'
    };
    return serviceTypeNames[type] || type;
  }

  // جلب سجل الأيام السابقة (history)
  const fetchHistory = useCallback(async () => {
    try {
      if (window.api && window.api.adminDb && typeof window.api.adminDb.getTickets === 'function') {
        const allTickets = await window.api.adminDb.getTickets()
        // تجميع التذاكر حسب اليوم
        const grouped = allTickets.reduce((acc, ticket) => {
          const date = formatUtils.formatDate(new Date(ticket.timestamp))
          if (!acc[date]) acc[date] = []
          acc[date].push(ticket)
          return acc
        }, {} as Record<string, any[]>)
        // تحويل إلى مصفوفة مرتبة تنازليًا حسب اليوم
        const historyArr = Object.entries(grouped)
          .map(([date, tickets]) => ({ date, tickets }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setHistory(historyArr)
      }
    } catch (e) {
      setHistory([])
    }
  }, [])

  // جلب السجل عند تحميل الصفحة
  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // فلترة السجل حسب اليوم
  const filteredHistory = useMemo(() => {
    if (!historyFilter) return history
    return history.filter(h => h.date === historyFilter)
  }, [history, historyFilter])

  return (
    <div className="min-h-screen overflow-scroll bg-gray-100 p-4" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* رسالة الحالة */}
        <AnimatePresence>
          {statusMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`mb-4 p-4 rounded-lg ${
                statusMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}
            >
              {statusMessage.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* رأس الصفحة */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="bg-indigo-600 text-white p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
              <div>
                <h1 className="text-3xl font-bold mb-1">لوحة تحكم الإدارة</h1>
                <p className="text-indigo-100">
                  آخر تحديث: {dataTimestamp || 'لم يتم التحديث بعد'}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 mt-4 md:mt-0">
                <button
                  onClick={() => refreshQueueState()}
                  className="px-4 py-2 bg-white text-indigo-600 rounded-md hover:bg-indigo-50 transition flex items-center justify-center"
                >
                  <svg
                    className="w-4 h-4 ml-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  تحديث البيانات
                </button>

                <button
                  onClick={() => fetchServices()}
                  className="px-4 py-2 bg-indigo-700 text-white rounded-md hover:bg-indigo-800 transition flex items-center justify-center"
                >
                  <svg
                    className="w-4 h-4 ml-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  تحديث الخدمات
                </button>
              </div>
            </div>
          </div>

          <div className="p-6">
            <ConnectionStatus />
          </div>
        </div>

        {/* البطاقات الإحصائية */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-pink-500 to-purple-500 text-white rounded-lg shadow-md p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm opacity-80">إجمالي التذاكر</p>
                <h3 className="text-2xl font-bold mt-1">{serviceStats.totalTickets}</h3>
              </div>
              <div className="bg-white bg-opacity-30 p-2 rounded-lg">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"></path>
                  <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h2zm3 4a1 1 0 000 2h.01a1 1 0 100-2H10a1 1 0 01-1-1z" clipRule="evenodd"></path>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z"></path>
                </svg>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center">
                <span className="bg-white bg-opacity-20 text-xs px-2 py-1 rounded">
                  {serviceStats.totalCompletedTickets} مكتملة
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-cyan-500 to-blue-500 text-white rounded-lg shadow-md p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm opacity-80">تذاكر اليوم</p>
                <h3 className="text-2xl font-bold mt-1">{dailyStats.todayTicketsCount}</h3>
              </div>
              <div className="bg-white bg-opacity-30 p-2 rounded-lg">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"></path>
                </svg>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center">
                <span className="bg-white bg-opacity-20 text-xs px-2 py-1 rounded">
                  آخر تصفير: {formatUtils.formatDate(dailyStats.lastResetDate)}
                </span>
              </div>
            </div>
          </div>

          {/* حذف بطاقة متوسط وقت الخدمة نهائياً */}

          <div className="bg-gradient-to-br from-emerald-500 to-green-500 text-white rounded-lg shadow-md p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm opacity-80">عدد الأيام النشطة</p>
                <h3 className="text-2xl font-bold mt-1">{formatUtils.formatNumber(dailyStats.daysActive)}</h3>
              </div>
              <div className="bg-white bg-opacity-30 p-2 rounded-lg">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd"></path>
                  <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z"></path>
                </svg>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center">
                <span className="bg-white bg-opacity-20 text-xs px-2 py-1 rounded">
                  {serviceStats.counterPerformance.length} مكاتب نشطة
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* قسم إحصائيات العد اليومي */}
        <div className="border border-indigo-100 rounded-lg overflow-hidden mb-6 shadow-md bg-white">
          <div
            className="bg-indigo-50 p-4 flex justify-between items-center cursor-pointer"
            onClick={() => setDailyStatsExpanded(!dailyStatsExpanded)}
          >
            <h2 className="text-lg font-medium text-indigo-800 flex items-center">
              <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              إحصائيات العد اليومي
            </h2>
            <svg
              className={`w-5 h-5 text-indigo-600 transition-transform ${dailyStatsExpanded ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {dailyStatsExpanded && (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-indigo-50 rounded-lg p-4 flex flex-col items-center">
                  <div className="text-indigo-600 text-xl font-bold">{formatUtils.formatNumber(dailyStats.currentTicketNumber)}</div>
                  <div className="text-gray-500 text-sm mt-1">رقم التذكرة الحالي</div>
                </div>
                <div className="bg-indigo-50 rounded-lg p-4 flex flex-col items-center">
                  <div className="text-indigo-600 text-xl font-bold">{formatUtils.formatNumber(dailyStats.todayTicketsCount)}</div>
                  <div className="text-gray-500 text-sm mt-1">عدد تذاكر اليوم</div>
                </div>
                <div className="bg-indigo-50 rounded-lg p-4 flex flex-col items-center">
                  <div className="text-indigo-600 text-xl font-bold">{formatUtils.formatDate(dailyStats.lastResetDate)}</div>
                  <div className="text-gray-500 text-sm mt-1">تاريخ آخر تصفير</div>
                </div>
                <div className="bg-indigo-50 rounded-lg p-4 flex flex-col items-center">
                  <div className="text-indigo-600 text-xl font-bold">{formatUtils.formatNumber(dailyStats.daysActive)}</div>
                  <div className="text-gray-500 text-sm mt-1">عدد أيام النشاط</div>
                </div>
              </div>

              <div className="mt-4 bg-blue-50 p-4 rounded-lg">
                <h3 className="text-sm font-semibold text-blue-800 mb-2">معلومات النظام</h3>
                <p className="text-gray-600 text-sm">
                  يتم إعادة العد تلقائياً في بداية كل يوم جديد (الساعة 12:00 صباحاً).
                  جميع التذاكر والإحصائيات تتم أرشفتها يومياً.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* قسم إدارة الخدمات */}
        <div className="border border-indigo-100 rounded-lg overflow-hidden mt-6 mb-6 shadow-md bg-white">
          <div
            className="bg-indigo-50 p-4 flex justify-between items-center cursor-pointer"
            onClick={() => setServicesExpanded(!servicesExpanded)}
          >
            <h2 className="text-lg font-medium text-indigo-800 flex items-center">
              <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
              إدارة الخدمات
            </h2>
            <svg
              className={`w-5 h-5 text-indigo-600 transition-transform ${servicesExpanded ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {servicesExpanded && (
            <div className="p-6">
              <div className="mb-4 flex justify-end">
                <button
                  onClick={() => {
                    setFormData({ name: '', type: '' })
                    setShowAddForm(true)
                    setShowEditForm(false)
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md flex items-center shadow-sm transition"
                >
                  <svg className="w-5 h-5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  إضافة خدمة جديدة
                </button>
              </div>

              {/* نموذج إضافة خدمة جديدة */}
              <AnimatePresence>
                {showAddForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border border-green-200 shadow-sm"
                  >
                    <h3 className="text-lg font-medium mb-4 text-green-800 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      إضافة خدمة جديدة
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">اسم الخدمة</label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
                          placeholder="مثال: الخدمات المالية"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">نوع الخدمة (معرف تقني)</label>
                        <input
                          type="text"
                          value={formData.type}
                          onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
                          placeholder="مثال: financial"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowAddForm(false)}
                        className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 transition"
                      >
                        إلغاء
                      </button>
                      <button
                        onClick={handleAddService}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition shadow-sm"
                      >
                        إضافة الخدمة
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* نموذج تعديل خدمة */}
              <AnimatePresence>
                {showEditForm && currentService && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-200 shadow-sm"
                  >
                    <h3 className="text-lg font-medium mb-4 text-blue-800 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      تعديل خدمة: {currentService.name}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">اسم الخدمة</label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">نوع الخدمة (معرف تقني)</label>
                        <input
                          type="text"
                          value={formData.type}
                          onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowEditForm(false)}
                        className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 transition"
                      >
                        إلغاء
                      </button>
                      <button
                        onClick={handleUpdateService}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition shadow-sm"
                      >
                        تحديث الخدمة
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* جدول الخدمات */}
              {isLoadingServices ? (
                <div className="text-center p-4">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600 mb-2"></div>
                  <p>جاري تحميل الخدمات...</p>
                </div>
              ) : services.length > 0 ? (
                <div className="overflow-x-auto rounded-lg shadow">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          الاسم
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          النوع
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          الإجراءات
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {services.map((service) => (
                        <tr key={service.id} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium text-gray-900">{service.name}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getServiceTypeColor(service.type)} text-white`}>
                              {service.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                            <button
                              onClick={() => handleEditService(service)}
                              className="text-indigo-600 hover:text-indigo-900 mx-2 transition"
                            >
                              <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteService(service.id)}
                              className="text-red-600 hover:text-red-900 mx-2 transition"
                            >
                              <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center p-10 bg-gray-50 rounded-lg border border-gray-200">
                  <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <p className="text-gray-500 mb-2">لا توجد خدمات مسجلة.</p>
                  <button
                    onClick={() => {
                      setFormData({ name: '', type: '' })
                      setShowAddForm(true)
                    }}
                    className="mt-2 inline-flex items-center px-4 py-2 border border-transparent text-sm leading-5 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:border-indigo-700 focus:shadow-outline-indigo active:bg-indigo-700 transition"
                  >
                    <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    أضف خدمة جديدة
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* قسم إحصائيات الخدمة */}
        <div className="border border-indigo-100 rounded-lg overflow-hidden mt-6 shadow-md bg-white">
          <div
            className="bg-indigo-50 p-4 flex justify-between items-center cursor-pointer"
            onClick={() => setStatsExpanded(!statsExpanded)}
          >
            <h2 className="text-lg font-medium text-indigo-800 flex items-center">
              <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              إحصائيات الخدمة
            </h2>
            <svg
              className={`w-5 h-5 text-indigo-600 transition-transform ${statsExpanded ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {statsExpanded && (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Service Stats */}
                <div className="col-span-1 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3 border-b pb-2">إحصائيات عامة</h3>
                  <ul className="space-y-3">
                    <li className="flex justify-between items-center">
                      <span className="text-gray-600">إجمالي التذاكر:</span>
                      <span className="font-semibold text-lg">{formatUtils.formatNumber(serviceStats.totalTickets)}</span>
                    </li>
                    <li className="flex justify-between items-center">
                      <span className="text-gray-600">التذاكر المكتملة:</span>
                      <span className="font-semibold text-lg">{formatUtils.formatNumber(serviceStats.totalCompletedTickets)}</span>
                    </li>
                    <li className="flex justify-between items-center">
                      <span className="text-gray-600">متوسط وقت الانتظار:</span>
                      <span className="font-semibold text-lg">
                        {formatUtils.formatDuration(serviceStats.averageWaitTime)}
                      </span>
                    </li>
                    <li className="flex justify-between items-center">
                      <span className="text-gray-600">ساعة الذروة:</span>
                      <span className="font-semibold">{serviceStats.peakHour}</span>
                    </li>
                  </ul>
                </div>

                {/* Service Type Distribution */}
                <div className="col-span-1 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3 border-b pb-2">توزيع أنواع الخدمة</h3>

                  {getServiceTypesData().length > 0 ? (
                    <ul className="space-y-4">
                      {getServiceTypesData().map(({ type, count, percentage }) => (
                        <li key={type} className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="flex items-center text-gray-700">
                              <span className={`w-3 h-3 rounded-full ${getServiceTypeColor(type)} mr-2`}></span>
                              {getServiceTypeName(type)}
                            </span>
                            <span className="text-gray-500 text-sm">{formatUtils.formatNumber(count)} ({percentage}%)</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                              className={`h-2.5 rounded-full ${getServiceTypeColor(type)}`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      لا توجد بيانات متاحة
                    </div>
                  )}
                </div>

                {/* Counter Performance */}
                <div className="col-span-1 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3 border-b pb-2">أداء المكاتب</h3>

                  {serviceStats.counterPerformance.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b">
                            <th className="py-2 text-right">المكتب</th>
                            <th className="py-2 text-right">العملاء</th>
                          </tr>
                        </thead>
                        <tbody>
                          {serviceStats.counterPerformance
                            .sort((a, b) => b.ticketsServed - a.ticketsServed)
                            .map((counter) => (
                              <tr key={counter.counterNumber} className="border-b text-sm">
                                <td className="py-2">
                                  <span className="font-medium">#{counter.counterNumber}</span>
                                </td>
                                <td className="py-2">{formatUtils.formatNumber(counter.ticketsServed)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      لا توجد بيانات متاحة
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* سجل الأيام السابقة */}
        <div className="border border-indigo-100 rounded-lg overflow-hidden mt-6 shadow-md bg-white">
          <div className="bg-indigo-50 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <h2 className="text-lg font-medium text-indigo-800 flex items-center">
              <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              سجل الأيام السابقة
            </h2>
            <div className="flex flex-col md:flex-row gap-2 items-center">
              <label className="text-sm text-gray-600">تصفية حسب اليوم:</label>
              <select
                className="border rounded px-2 py-1"
                value={historyFilter}
                onChange={e => setHistoryFilter(e.target.value)}
              >
                <option value="">كل الأيام</option>
                {history.map(h => (
                  <option key={h.date} value={h.date}>{h.date}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: 400 }}>
            {filteredHistory.length === 0 ? (
              <div className="text-center text-gray-500 py-8">لا يوجد سجل متاح</div>
            ) : (
              filteredHistory.map(h => (
                <div key={h.date} className="mb-8">
                  <div className="font-bold text-indigo-700 mb-2">{h.date}</div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm rounded-lg shadow border">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-2 border">رقم التذكرة</th>
                          <th className="px-2 py-2 border">نوع الخدمة</th>
                          <th className="px-2 py-2 border">الحالة</th>
                          <th className="px-2 py-2 border">وقت الإنشاء</th>
                          <th className="px-2 py-2 border">وقت النداء</th>
                          <th className="px-2 py-2 border">وقت الإكمال</th>
                          <th className="px-2 py-2 border">المكتب</th>
                        </tr>
                      </thead>
                      <tbody>
                        {h.tickets.map((ticket: any) => (
                          <tr key={ticket.id} className="hover:bg-gray-50">
                            <td className="px-2 py-1 border text-center">{ticket.id}</td>
                            <td className="px-2 py-1 border text-center">{ticket.serviceType}</td>
                            <td className="px-2 py-1 border text-center">{ticket.status}</td>
                            <td className="px-2 py-1 border text-center">{ticket.timestamp ? formatUtils.formatTime(new Date(ticket.timestamp)) : '-'}</td>
                            <td className="px-2 py-1 border text-center">{ticket.calledTime ? formatUtils.formatTime(new Date(ticket.calledTime)) : '-'}</td>
                            <td className="px-2 py-1 border text-center">{ticket.completedTime ? formatUtils.formatTime(new Date(ticket.completedTime)) : '-'}</td>
                            <td className="px-2 py-1 border text-center">{ticket.counterNumber || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
