import './assets/main.css'
import './utils/logger' // Capture all console errors/warnings

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CustomerScreen from './screens/CustomerScreen'
import DisplayScreen from './screens/DisplayScreen'
import EmployeeScreen from './screens/EmployeeScreen'
import AdminScreen from './screens/AdminScreen'
import { QueueProvider } from './context/QueueContext'
import { SERVER_CONFIG } from './config/serverConfig';

// Detect if we're running in Electron or browser
const isElectron = window.navigator.userAgent.toLowerCase().indexOf('electron') > -1

// Determine which screen to show based on URL parameter or hash
function getScreenDetails(): { type: string; counterId?: number } {
  // In development, we use query parameters
  const urlParams = new URLSearchParams(window.location.search)
  const screenParam = urlParams.get('screen')
  const counterParam = urlParams.get('counter')

  // In production, we use hash
  let hash = window.location.hash.replace('#', '')
  let hashCounterId: number | undefined = undefined

  // Check for employee screen with counter ID (format: employee/123)
  const employeeMatch = hash.match(/^employee\/(\d+)$/)
  if (employeeMatch) {
    hash = 'employee'
    hashCounterId = parseInt(employeeMatch[1], 10)
  }

  return {
    type: screenParam || hash || 'customer',
    counterId: counterParam ? parseInt(counterParam, 10) : hashCounterId
  }
}

// Initialize browser API polyfill if we're not in Electron
if (!isElectron && !window.api) {
  // Define ticket interface
  interface Ticket {
    id: number;
    timestamp: number;
    status: string;
    serviceType: string;
    counterNumber?: number;
  }

  // Simple in-memory state for browser testing
  const browserQueueState = {
    tickets: [] as Ticket[],
    counters: [{ id: 1, busy: false, currentTicket: null as number | null, status: 'active' }],
    lastTicketNumber: 0
  }

  // Browser API polyfill
  window.api = {
    getNetworkInfo: function (): Promise<{ localIp: string; isConnected: boolean }> {
      return Promise.resolve({ localIp: 'localhost', isConnected: true })
    },
    startLocalServer: function (): Promise<{ success: boolean }> {
      return Promise.resolve({ success: true })
    },
    adminDb: {
      getServices: async () => Promise.resolve([]),
      addService: async () => Promise.resolve(null),
      deleteService: async () => Promise.resolve(),
      updateService: async () => { },
      getTickets: async () => Promise.resolve([]),
      addTicket: async () => Promise.resolve(null),
      updateTicketStatus: async () => Promise.resolve(),
      getCounters: async () => Promise.resolve([]),
      updateCounter: async () => Promise.resolve(),
      getAnalytics: async () => Promise.resolve(),
      getTodayStats: async () => Promise.resolve(),
      clearDatabase: async () => Promise.resolve(),
      getDbInfo: async () => Promise.resolve(null)
    },
    queue: {
      getQueueState: async () => {
        return Promise.resolve(browserQueueState)
      },
      addTicket: async (serviceType: string) => {
        // Create a new ticket
        const newTicket = {
          id: ++browserQueueState.lastTicketNumber,
          timestamp: Date.now(),
          status: 'waiting',
          serviceType
        }

        // Add to local state
        browserQueueState.tickets.push(newTicket)
        return Promise.resolve(newTicket)
      },
      callNextCustomer: async (counterId: number) => {
        // Find next waiting ticket
        const nextTicket = browserQueueState.tickets.find((t) => t.status === 'waiting')
        if (!nextTicket) return Promise.resolve(null)

        // Update ticket status
        nextTicket.status = 'serving'
        nextTicket.counterNumber = counterId

        // Update counter
        const counter = browserQueueState.counters.find((c) => c.id === counterId)
        if (counter) {
          counter.busy = true
          counter.currentTicket = nextTicket.id
        }

        return Promise.resolve(nextTicket)
      },
      completeService: async (counterId: number) => {
        const counter = browserQueueState.counters.find((c) => c.id === counterId)
        if (!counter || counter.currentTicket === null) {
          return Promise.resolve()
        }

        // Find and update ticket
        const ticket = browserQueueState.tickets.find((t) => t.id === counter.currentTicket)
        if (ticket) {
          ticket.status = 'complete'
        }

        // Update counter
        counter.busy = false
        counter.currentTicket = null

        return Promise.resolve()
      },
      updateCounterStatus: async (counterId: number, status: string) => {
        const counter = browserQueueState.counters.find((c) => c.id === counterId)
        if (counter) {
          counter.status = status
        }
        return Promise.resolve(true)
      },
      createEmployeeWindow: (counterId: number) => {
        // In browser mode, open a new tab
        const url = new URL(window.location.href)
        if (url.search) {
          url.searchParams.set('screen', 'employee')
          url.searchParams.set('counter', counterId.toString())
        } else {
          url.hash = `employee/${counterId}`
        }
        window.open(url.toString(), '_blank')
        return Promise.resolve({ success: true })
      },
      onQueueStateUpdated: (callback: (data: any) => void) => {
        // In browser mode, there's no real-time updates
        // Just return a no-op function as unsubscribe
        return () => { }
      },
      connectToServer: function (serverUrl?: string): Promise<any> {
        throw new Error('Function not implemented.')
      },
      disconnectFromServer: function (): Promise<void> {
        throw new Error('Function not implemented.')
      },
      startLocalServer: function (): Promise<any> {
        throw new Error('Function not implemented.')
      }
    },
    // Add a stub for 'resources' to match the API type
    resources: {
      getResourcePath: function (resourceName: string): Promise<string> {
        throw new Error('Function not implemented.')
      }
    }
  }
}

async function startSocketServerIfNeeded() {
  const { type: screenType } = getScreenDetails();
  
  // Only the display screen should start the socket server
  if (screenType === 'display') {
    console.log('Display screen detected, ensuring socket server is running...');
    
    try {
      // For Electron, use the main process
      if (window.api) {
        // Check if this is the server machine
        const networkInfo = await window.api.getNetworkInfo();
        if (networkInfo.localIp === SERVER_CONFIG.SERVER_HOST) {
          console.log(`This is the server machine (${SERVER_CONFIG.SERVER_HOST}), starting socket server...`);
          const result = await window.api.startLocalServer();
          console.log('Socket server started:', result);
        } else {
          console.log(`This is a remote display, will connect to ${SERVER_CONFIG.SERVER_HOST}:${SERVER_CONFIG.SERVER_PORT}`);
        }
        return { success: true };
      } 
      // For browser dev mode, use a direct connection
      else {
        console.log(`Running in browser mode, connecting to ${SERVER_CONFIG.SERVER_HOST}:${SERVER_CONFIG.SERVER_PORT}`);
        return { success: true };
      }
    } catch (error) {
      console.error('Failed to start socket server:', error);
    }
  } else {
    console.log(`${screenType} screen detected, will connect to ${SERVER_CONFIG.SERVER_HOST}:${SERVER_CONFIG.SERVER_PORT}`);
  }
  
  return { success: true };
}

// Modify renderApp to wait for server startup first
async function renderApp(): Promise<void> {
  try {
    // First ensure server is started (if this is the display screen)
    await startSocketServerIfNeeded();
    
    // Now continue with the regular app initialization
    const { type: screenType, counterId } = getScreenDetails();
    let Component: React.ComponentType<any>;
    const componentProps: any = {}

    // Select the component based on the screen type
    switch (screenType) {
      case 'admin':
        Component = AdminScreen
        document.title = 'لوحة تحكم الأدمن - FocusQ'
        document.body.classList.add('fullscreen-mode', 'admin-screen-mode')
        break
      case 'display':
        Component = DisplayScreen
        document.title = 'شاشة العرض - FocusQ'
        document.body.classList.add('fullscreen-mode', 'display-screen-mode')
        break
      case 'employee':
        Component = EmployeeScreen
        document.title = counterId
          ? `شاشة الموظف - مكتب ${counterId} - FocusQ`
          : 'شاشة الموظف - FocusQ'
        document.body.classList.add('fullscreen-mode', 'employee-screen-mode')
        if (counterId) {
          componentProps.counterId = counterId
        }
        break
      case 'customer':
      default:
        Component = CustomerScreen
        document.title = 'شاشة العملاء - FocusQ'
        document.body.classList.add('fullscreen-mode', 'customer-screen-mode')
        break
    }

    // Set full screen mode
    document.documentElement.style.height = '100%'
    document.body.style.height = '100%'
    document.body.style.margin = '0'
    document.body.style.padding = '0'
    document.body.style.overflow = 'hidden'

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <QueueProvider>
          <div className="fullscreen-container" dir="rtl">
            <Component {...componentProps} />
          </div>
        </QueueProvider>
      </StrictMode>
    )
  } catch (error) {
    console.error('Error initializing app:', error)
    document.getElementById('root')!.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h2>Error Initializing Application</h2>
        <p>${error instanceof Error ? error.message : String(error)}</p>
        <button onclick="window.location.reload()">Retry</button>
      </div>
    `
  }
}

// Start the app, with error handling
renderApp().catch(error => {
  console.error('Fatal error during app initialization:', error);
});

// Add global type definitions
declare global {
  interface API {
    getNetworkInfo(): Promise<{ localIp: string; isConnected: boolean }>
    connectToServer(serverInput: string): Promise<{ success: boolean }>
    disconnectFromServer(): Promise<void>
    startLocalServer(): Promise<{ success: boolean }>
    queue: {
      getQueueState: () => Promise<any>
      addTicket: (serviceType: string) => Promise<any>
      callNextCustomer: (counterId: number) => Promise<any>
      completeService: (counterId: number) => Promise<void>
      updateCounterStatus: (counterId: number, status: string) => Promise<any>
      createEmployeeWindow: (counterId: number) => Promise<any>
      onQueueStateUpdated: (callback: (data: any) => void) => () => void
    }
    adminDb?: {
      getServices: () => Promise<any>
      addService: (name: string, type: string) => Promise<any>
      deleteService: (id: number) => Promise<any>
      updateService: (id: number, name: string, type: string) => Promise<any>
      getTickets: () => Promise<any>
      addTicket: (ticket: any) => Promise<any>
      updateTicketStatus: (id: number, status: string) => Promise<any>
      getCounters: () => Promise<any>
      updateCounter: (
        id: number,
        status: string,
        busy: number,
        currentTicket: number | null
      ) => Promise<any>
      getAnalytics: () => Promise<any>
      getTodayStats: () => Promise<any>
      clearDatabase: () => Promise<any>
      getDbInfo: () => Promise<any>
    }
  }
  
  // Augment the Window interface instead of redeclaring it

}
