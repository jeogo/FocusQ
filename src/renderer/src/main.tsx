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
import type { Ticket, Counter, QueueState } from './types';

// Detect if we're running in Electron or browser
const isElectron = window.navigator.userAgent.toLowerCase().indexOf('electron') > -1

// Determine which screen to show based on URL parameter or hash
function getScreenDetails(): { type: string; counterId?: number; displayId?: number } {
  // First check if this is a static asset request
  if (window.location.pathname.startsWith('/assets/')) {
    return { type: 'asset' };
  }

  // Rest of your existing screen detection code
  const urlParams = new URLSearchParams(window.location.search)
  const screenParam = urlParams.get('screen')
  const counterParam = urlParams.get('counter')
  const displayParam = urlParams.get('display')  // Add display parameter support

  // In production, we use hash
  let hash = window.location.hash.replace('#', '')
  let hashCounterId: number | undefined = undefined
  let hashDisplayId: number | undefined = undefined  // Add display ID for hash

  // Check for employee screen with counter ID (format: employee/123)
  const employeeMatch = hash.match(/^employee\/(\d+)$/)
  if (employeeMatch) {
    hash = 'employee'
    hashCounterId = parseInt(employeeMatch[1], 10)
  }

  // Check for display screen with display ID (format: display/123)
  const displayMatch = hash.match(/^display\/(\d+)$/)
  if (displayMatch) {
    hash = 'display'
    hashDisplayId = parseInt(displayMatch[1], 10)
  }

  return {
    type: screenParam || hash || 'customer',
    counterId: counterParam ? parseInt(counterParam, 10) : hashCounterId,
    displayId: displayParam ? parseInt(displayParam, 10) : hashDisplayId
  };
}

// Initialize browser API polyfill if we're not in Electron
if (!isElectron && !window.api) {
  // استخدم الأنواع الصحيحة من types.ts
  // Define ticket interface
  // Simple in-memory state for browser testing
  const browserQueueState: QueueState = {
    tickets: [] as Ticket[],
    counters: [{ id: 1, busy: false, currentTicket: null, status: 'active' }],
    lastTicketNumber: 0
  }

  // Browser API polyfill
  window.api = {
    config: SERVER_CONFIG, // Add the missing config property
    display: {},
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
      getQueueState: async (): Promise<QueueState> => {
        // تأكد من أن كل تذكرة status من النوع الصحيح
        return {
          ...browserQueueState,
          tickets: browserQueueState.tickets.map(t => ({
            ...t,
            status: t.status as Ticket['status']
          })),
          counters: browserQueueState.counters.map(c => ({ ...c }))
        };
      },
      addTicket: async (serviceType: string, customerName?: string): Promise<Ticket> => {
        const newTicket: Ticket = {
          id: ++browserQueueState.lastTicketNumber,
          timestamp: Date.now(),
          status: 'waiting',
          serviceType,
          ...(customerName ? { customerName } : {})
        };
        browserQueueState.tickets.push(newTicket);
        return newTicket;
      },
      callNextCustomer: async (counterId: number): Promise<Ticket | null> => {
        const nextTicket = browserQueueState.tickets.find((t) => t.status === 'waiting');
        if (!nextTicket) return null;
        nextTicket.status = 'serving';
        nextTicket.counterNumber = counterId;
        const counter = browserQueueState.counters.find((c) => c.id === counterId);
        if (counter) {
          counter.busy = true;
          counter.currentTicket = nextTicket.id;
        }
        return nextTicket;
      },
      completeService: async (counterId: number): Promise<void> => {
        const counter = browserQueueState.counters.find((c) => c.id === counterId);
        if (!counter || counter.currentTicket === null) return;
        const ticket = browserQueueState.tickets.find((t) => t.id === counter.currentTicket);
        if (ticket) {
          ticket.status = 'complete';
        }
        counter.busy = false;
        counter.currentTicket = null;
      },
      updateCounterStatus: async (counterId: number, status: string) => {
        const counter = browserQueueState.counters.find((c) => c.id === counterId);
        if (counter) {
          counter.status = status as Counter['status'];
        }
        return true;
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
      onQueueStateUpdated: () => {
        // In browser mode, there's no real-time updates
        // Just return a no-op function as unsubscribe
        return () => { }
      },
      connectToServer: function (): Promise<any> {
        throw new Error('Function not implemented.')
      },
      disconnectFromServer: function (): Promise<void> {
        throw new Error('Function not implemented.')
      },
      startLocalServer: function (): Promise<any> {
        throw new Error('Function not implemented.')
      },
      requestCounterId: () => Promise.resolve(1)
    },
    // Add a stub for 'resources' to match the API type
    resources: {
      getResourcePath: function (): Promise<string> {
        throw new Error('Function not implemented.')
      },
      getPlatform: function (): unknown {
        throw new Error('Function not implemented.')
      },
      writeFile: function (): unknown {
        throw new Error('Function not implemented.')
      }
    }
  }
}


// Modify renderApp to wait for server startup first
async function renderApp(): Promise<void> {
  try {
    const { type, counterId, displayId } = getScreenDetails();

    // Don't render app UI for asset requests
    if (type === 'asset') {
      return;
    }

    // Now continue with the regular app initialization
    let Component;
    let props: any = {};

    // Select the component based on the screen type
    switch (type) {
      case 'customer':
        Component = CustomerScreen;
        break;
      case 'display':
        Component = DisplayScreen;
        props = { displayId: displayId || 1 }; // Pass display ID
        break;
      case 'employee':
        Component = EmployeeScreen;
        props = { counterId };
        break;
      case 'admin':
        Component = AdminScreen;
        break;
      default:
        Component = CustomerScreen;
    }

    // Set full screen mode
    document.documentElement.style.height = '100%'
    document.body.style.height = '100%'
    document.body.style.margin = '0'
    document.body.style.padding = '0'
    document.body.style.overflow = 'hidden'

    createRoot(document.getElementById('root') as HTMLElement).render(
      <StrictMode>
        <QueueProvider>
          <Component {...props} />
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
      requestCounterId: () => Promise<number>
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
