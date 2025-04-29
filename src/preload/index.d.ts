/* eslint-disable @typescript-eslint/no-explicit-any */
import { ElectronAPI } from '@electron-toolkit/preload'

interface QueueAPI {
  getQueueState: () => Promise<any>
  addTicket: (serviceType: string, customerName?: string) => Promise<any>
  callNextCustomer: (counterId: number) => Promise<any>
  completeService: (counterId: number) => Promise<any>
  updateCounterStatus: (counterId: number, status: 'active' | 'inactive') => Promise<any>
  createEmployeeWindow: (counterId: number) => Promise<any>
  getNextCounterId: () => Promise<number>
  addCounter: () => Promise<number>
  onQueueStateUpdated: (callback: (data: any) => void) => () => void
  connectToServer: (serverUrl?: string) => Promise<any>
  disconnectFromServer: () => Promise<void>
  getNetworkInfo: () => Promise<any>
  startLocalServer: () => Promise<any>
}

interface AdminDbAPI {
  getServices: () => Promise<any[]>
  addService: (name: string, type: string) => Promise<any>
  deleteService: (id: number) => Promise<void>
  getTickets: () => Promise<any[]>
  addTicket: (ticket: any) => Promise<any>
  updateTicketStatus: (id: number, status: string) => Promise<void>
  getCounters: () => Promise<any[]>
  updateCounter: (id: number, status: string, busy: number, currentTicket: number | null) => Promise<void>
  getAnalytics: () => Promise<any>
  getTodayStats: () => Promise<any>
  clearDatabase: () => Promise<void>
  getDbInfo: () => Promise<any>
}

interface ResourcesAPI {
  getResourcePath: (resourcePath: string) => Promise<string | null>
  checkResourceExists: (resourcePath: string) => Promise<boolean>
}

declare global {
  interface ElectronAPI {
    startSocketServer?: () => void;
  }
  interface Window {
    electron: ElectronAPI
    electronAPI?: ElectronAPI
    ipcRenderer?: {
      send: (channel: string, ...args: any[]) => void;
      // Add more methods if needed
    };
    api: {
      queue: QueueAPI
      adminDb: AdminDbAPI
      resources: ResourcesAPI
    }
  }
}
