import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  queue: {
    // الحصول على حالة الطابور
    getQueueState: () => ipcRenderer.invoke('get-queue-state'),

    // إضافة تذكرة جديدة
    addTicket: (serviceType: string, customerName?: string) =>
      ipcRenderer.invoke('add-ticket', serviceType, customerName),

    // استدعاء العميل التالي
    callNextCustomer: (counterId: number) => ipcRenderer.invoke('call-next-customer', counterId),

    // إنهاء الخدمة
    completeService: (counterId: number) => ipcRenderer.invoke('complete-service', counterId),

    // تحديث حالة المكتب
    updateCounterStatus: (counterId: number, status: 'active' | 'inactive') =>
      ipcRenderer.invoke('update-counter-status', counterId, status),

    // إنشاء نافذة موظف جديدة
    createEmployeeWindow: (counterId: number) =>
      ipcRenderer.invoke('create-employee-window', counterId),

    // الحصول على معرف مكتب جديد متاح
    getNextCounterId: () => ipcRenderer.invoke('get-next-counter-id'),

    // إنشاء مكتب جديد
    addCounter: () => ipcRenderer.invoke('add-counter'),

    // الاشتراك في تحديثات حالة الطابور
    onQueueStateUpdated: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any): void => callback(data)
      ipcRenderer.on('queue-state-updated', listener)
      return () => {
        ipcRenderer.removeListener('queue-state-updated', listener)
      }
    },

    // وظائف شبكة WebSocket
    connectToServer: (serverUrl?: string) => ipcRenderer.invoke('connect-to-websocket-server', serverUrl),
    disconnectFromServer: () => ipcRenderer.invoke('disconnect-from-websocket-server'),
    getNetworkInfo: () => ipcRenderer.invoke('get-network-info'),
    startLocalServer: () => ipcRenderer.invoke('start-local-server')
  },
  adminDb: {
    getServices: () => ipcRenderer.invoke('db-get-services'),
    addService: (name: string, type: string) => ipcRenderer.invoke('db-add-service', name, type),
    deleteService: (id: number) => ipcRenderer.invoke('db-delete-service', id),
    getTickets: () => ipcRenderer.invoke('db-get-tickets'),
    addTicket: (ticket: any) => ipcRenderer.invoke('db-add-ticket', ticket),
    updateTicketStatus: (id: number, status: string) => ipcRenderer.invoke('db-update-ticket-status', id, status),
    getCounters: () => ipcRenderer.invoke('db-get-counters'),
    updateCounter: (id: number, status: string, busy: number, currentTicket: number | null) =>
      ipcRenderer.invoke('db-update-counter', id, status, busy, currentTicket),
    getAnalytics: () => ipcRenderer.invoke('db-get-analytics'),
    getTodayStats: () => ipcRenderer.invoke('db-get-today-stats'),
    clearDatabase: () => ipcRenderer.invoke('db-clear-database'),
    getDbInfo: () => ipcRenderer.invoke('db-get-info')
  },
  // Resources API
  resources: {
    getResourcePath: (resourcePath: string) => 
      ipcRenderer.invoke('get-resource-path', resourcePath),
    checkResourceExists: (resourcePath: string) =>
      ipcRenderer.invoke('check-resource-exists', resourcePath)
  },
}

// Use contextBridge to expose API to renderer
contextBridge.exposeInMainWorld('api', {
  ...api,

  // Add display screen management API
  display: {
    createNewDisplay: () => ipcRenderer.invoke('create-display-screen')
  }
})
