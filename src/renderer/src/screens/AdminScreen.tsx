import { useState, useEffect, useCallback } from 'react'
import { useQueue } from '../context/QueueContext'
import ConnectionStatus from '../components/ConnectionStatus'
import { motion, AnimatePresence } from 'framer-motion'

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
  
  // إحصائيات الخدمة (كما هو في الكود الحالي)
  const [serviceStats, setServiceStats] = useState({
    averageWaitTime: 0,
    averageServiceTime: 0,
    totalTickets: 0,
    totalCompletedTickets: 0,
    peakHour: '',
    typeCounts: {} as Record<string, number>,
    counterPerformance: [] as { counterNumber: number; avgServiceTime: number; ticketsServed: number }[]
  })

  // جلب الخدمات من قاعدة البيانات
  const fetchServices = useCallback(async () => {
    setIsLoadingServices(true)
    
    try {
      if (window.api && window.api.adminDb) {
        const dbServices = await window.api.adminDb.getServices()
        setServices(dbServices || [])
      } else {
        console.error('Admin database not available')
        setStatusMessage({
          type: 'error',
          text: 'تعذر الوصول إلى قاعدة البيانات'
        })
      }
    } catch (error) {
      console.error('Error fetching services:', error)
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
      console.error('Error adding service:', error)
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
          // Fallback: delete then add (not ideal, but prevents crash)
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
      console.error('Error updating service:', error)
      setStatusMessage({
        type: 'error',
        text: 'حدث خطأ أثناء تحديث الخدمة'
      })
    }
  }

  // حذف خدمة
  const handleDeleteService = async (serviceId: number) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الخدمة؟')) {
      return
    }

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
      console.error('Error deleting service:', error)
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

  // الدالة الحالية لحساب إحصائيات الخدمة
  const calculateServiceStats = useCallback(() => {
    if (!queueState?.tickets) return

    const tickets = queueState.tickets
    const completedTickets = tickets.filter(ticket => ticket.status === 'complete')
    const totalCompletedTickets = completedTickets.length

    // Type counts
    const typeCounts: Record<string, number> = {}
    tickets.forEach(ticket => {
      const type = ticket.serviceType || 'unknown'
      typeCounts[type] = (typeCounts[type] || 0) + 1
    })

    // Calculate average wait time
    let totalWaitTime = 0
    completedTickets.forEach(ticket => {
      if (ticket.timestamp) {
        totalWaitTime += Date.now() - ticket.timestamp
      }
    })
    const averageWaitTime = totalCompletedTickets > 0
      ? totalWaitTime / totalCompletedTickets / 60000 // in minutes
      : 0

    // Calculate average service time
    let totalServiceTime = 0
    completedTickets.forEach(ticket => {
      if (ticket.timestamp) {
        totalServiceTime += Date.now() - ticket.timestamp
      }
    })
    const averageServiceTime = totalCompletedTickets > 0
      ? totalServiceTime / totalCompletedTickets / 60000 // in minutes
      : 0

    // Determine peak hour (most tickets created)
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

    // Counter performance stats
    const counterStats: Record<number, { totalTime: number; ticketsCount: number }> = {}
    completedTickets.forEach(ticket => {
      if (ticket.counterNumber && ticket.timestamp) {
        const counterNumber = ticket.counterNumber
        const serviceTime = Date.now() - ticket.timestamp

        if (!counterStats[counterNumber]) {
          counterStats[counterNumber] = { totalTime: 0, ticketsCount: 0 }
        }

        counterStats[counterNumber].totalTime += serviceTime
        counterStats[counterNumber].ticketsCount += 1
      }
    })

    const counterPerformance = Object.entries(counterStats).map(([counterNumber, stats]) => ({
      counterNumber: parseInt(counterNumber),
      avgServiceTime: stats.ticketsCount > 0 ? stats.totalTime / stats.ticketsCount / 60000 : 0, // in minutes
      ticketsServed: stats.ticketsCount
    }))

    setServiceStats({
      averageWaitTime,
      averageServiceTime,
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

  // جلب البيانات عند تحميل الصفحة
  useEffect(() => {
    refreshQueueState()
    fetchServices()
  }, [refreshQueueState, fetchServices])

  // تحديث الطابع الزمني والإحصاءات عند تغيير حالة الطابور
  useEffect(() => {
    if (queueState) {
      setDataTimestamp(new Date().toLocaleString('ar-SA'))
      calculateServiceStats()
    }
  }, [queueState, calculateServiceStats])

  // حساب توزيع أنواع التذاكر
  const getServiceTypesData = () => {
    if (!serviceStats.typeCounts) return []
    return Object.entries(serviceStats.typeCounts).map(([type, count]) => ({
      type,
      count,
      percentage: serviceStats.totalTickets > 0
        ? Math.round((count / serviceStats.totalTickets) * 100)
        : 0
    }))
  }

  // الحصول على اسم نوع الخدمة
  const getServiceTypeName = (type: string): string => {
    const types: Record<string, string> = {
      'general': 'الخدمات العامة',
      'financial': 'الخدمات المالية',
      'technical': 'الدعم الفني',
      'unknown': 'غير محدد'
    }
    return types[type] || type
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

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          <p className="mt-4 text-xl">جاري تحميل البيانات...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4" dir="rtl">
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
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 mb-1">لوحة تحكم الإدارة</h1>
              <p className="text-sm text-gray-500">
                آخر تحديث: {dataTimestamp || 'لم يتم التحديث بعد'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-4 md:mt-0">
              <button
                onClick={() => refreshQueueState()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition flex items-center justify-center"
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
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition flex items-center justify-center"
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

          <ConnectionStatus />
          
          {/* قسم إدارة الخدمات */}
          <div className="border rounded-lg overflow-hidden mt-6 mb-6">
            <div
              className="bg-indigo-100 p-4 flex justify-between items-center cursor-pointer"
              onClick={() => setServicesExpanded(!servicesExpanded)}
            >
              <h2 className="text-lg font-medium text-gray-800">إدارة الخدمات</h2>
              <svg
                className={`w-5 h-5 transition-transform ${servicesExpanded ? 'transform rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {servicesExpanded && (
              <div className="p-4 bg-white">
                <div className="mb-4 flex justify-end">
                  <button
                    onClick={() => {
                      setFormData({ name: '', type: '' })
                      setShowAddForm(true)
                      setShowEditForm(false)
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md flex items-center"
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
                      className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200"
                    >
                      <h3 className="text-lg font-medium mb-4">إضافة خدمة جديدة</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">اسم الخدمة</label>
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full p-2 border border-gray-300 rounded-md"
                            placeholder="مثال: الخدمات المالية"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">نوع الخدمة (معرف تقني)</label>
                          <input
                            type="text"
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                            className="w-full p-2 border border-gray-300 rounded-md"
                            placeholder="مثال: financial"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setShowAddForm(false)}
                          className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400"
                        >
                          إلغاء
                        </button>
                        <button
                          onClick={handleAddService}
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
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
                      className="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-200"
                    >
                      <h3 className="text-lg font-medium mb-4">تعديل خدمة: {currentService.name}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">اسم الخدمة</label>
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full p-2 border border-gray-300 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">نوع الخدمة (معرف تقني)</label>
                          <input
                            type="text"
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                            className="w-full p-2 border border-gray-300 rounded-md"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setShowEditForm(false)}
                          className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400"
                        >
                          إلغاء
                        </button>
                        <button
                          onClick={handleUpdateService}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
                  <div className="overflow-x-auto">
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
                          <tr key={service.id} className="hover:bg-gray-50">
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
                                className="text-indigo-600 hover:text-indigo-900 ml-4"
                              >
                                تعديل
                              </button>
                              <button
                                onClick={() => handleDeleteService(service.id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                حذف
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center p-4 text-gray-500">
                    لا توجد خدمات مسجلة. قم بإضافة خدمات جديدة.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* قسم إحصائيات الخدمة (الكود الحالي) */}
          <div className="border rounded-lg overflow-hidden mt-6">
            <div
              className="bg-gray-100 p-4 flex justify-between items-center cursor-pointer"
              onClick={() => setStatsExpanded(!statsExpanded)}
            >
              <h2 className="text-lg font-medium text-gray-800">إحصائيات الخدمة</h2>
              <svg
                className={`w-5 h-5 transition-transform ${statsExpanded ? 'transform rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {statsExpanded && (
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Service Stats */}
                  <div className="col-span-1 bg-white rounded-lg shadow-sm border p-4">
                    <h3 className="text-sm font-semibold text-gray-600 mb-3 border-b pb-2">إحصائيات عامة</h3>
                    <ul className="space-y-3">
                      <li className="flex justify-between items-center">
                        <span className="text-gray-600">إجمالي التذاكر:</span>
                        <span className="font-semibold text-lg">{serviceStats.totalTickets}</span>
                      </li>
                      <li className="flex justify-between items-center">
                        <span className="text-gray-600">التذاكر المكتملة:</span>
                        <span className="font-semibold text-lg">{serviceStats.totalCompletedTickets}</span>
                      </li>
                      <li className="flex justify-between items-center">
                        <span className="text-gray-600">متوسط وقت الانتظار:</span>
                        <span className="font-semibold text-lg">
                          {serviceStats.averageWaitTime.toFixed(1)} دقيقة
                        </span>
                      </li>
                      <li className="flex justify-between items-center">
                        <span className="text-gray-600">متوسط وقت الخدمة:</span>
                        <span className="font-semibold text-lg">
                          {serviceStats.averageServiceTime.toFixed(1)} دقيقة
                        </span>
                      </li>
                      <li className="flex justify-between items-center">
                        <span className="text-gray-600">ساعة الذروة:</span>
                        <span className="font-semibold">{serviceStats.peakHour}</span>
                      </li>
                    </ul>
                  </div>

                  {/* Service Type Distribution */}
                  <div className="col-span-1 bg-white rounded-lg shadow-sm border p-4">
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
                              <span className="text-gray-500 text-sm">{count} ({percentage}%)</span>
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
                  <div className="col-span-1 bg-white rounded-lg shadow-sm border p-4">
                    <h3 className="text-sm font-semibold text-gray-600 mb-3 border-b pb-2">أداء المكاتب</h3>

                    {serviceStats.counterPerformance.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead>
                            <tr className="text-xs text-gray-500 border-b">
                              <th className="py-2 text-right">المكتب</th>
                              <th className="py-2 text-right">العملاء</th>
                              <th className="py-2 text-right">متوسط الوقت</th>
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
                                  <td className="py-2">{counter.ticketsServed}</td>
                                  <td className="py-2">{counter.avgServiceTime.toFixed(1)} دقيقة</td>
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
        </div>
      </div>
    </div>
  )
}
