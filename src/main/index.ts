import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as os from 'os'
import * as fs from 'fs'
import * as db from './db'
import { startServer, stopServer, updateQueueState, setInitialState } from './socket/express-server'

// Store employee windows with their counter ID
const employeeWindows: Map<number, BrowserWindow> = new Map()

interface Ticket {
  id: number
  timestamp: number
  status: string
  serviceType: string
  counterNumber?: number
  extraData?: Record<string, any>
}

interface Counter {
  id: number
  busy: boolean
  currentTicket: number | null
  status: string
  extraData?: Record<string, any>
}

interface QueueState {
  tickets: Ticket[]
  lastTicketNumber: number
  counters: Counter[]
  extraData?: Record<string, any>
}

const queueState: QueueState = {
  tickets: [],
  lastTicketNumber: 0,
  counters: [{ id: 1, busy: false, currentTicket: null, status: 'active' }],
  extraData: {}
}

// إنشاء مجلد للتخزين
const DATA_FOLDER = join(app.getPath('userData'), 'queue-data')
if (!fs.existsSync(DATA_FOLDER)) {
  fs.mkdirSync(DATA_FOLDER, { recursive: true })
}

// مسار ملف حفظ حالة الطابور
const QUEUE_STATE_FILE = join(DATA_FOLDER, 'queue-state.json')

// الحصول على عنوان IP المحلي للشبكة
function getLocalIpAddress(): string {
  const nets = os.networkInterfaces()
  let localIp = 'localhost'

  // البحث عن عنوان IP غير localhost
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // تجاهل عناوين IPv6 وعناوين localhost
      if (net.family === 'IPv4' && !net.internal) {
        localIp = net.address
        return localIp
      }
    }
  }

  return localIp
}

// Load queue state from disk
function loadQueueState(): void {
  try {
    if (fs.existsSync(QUEUE_STATE_FILE)) {
      const data = fs.readFileSync(QUEUE_STATE_FILE, 'utf8')
      const loadedState = JSON.parse(data)

      // Merge loaded state with default state
      Object.assign(queueState, loadedState)
      console.log('Loaded queue state from file')
    } else {
      // Create initial state file
      saveQueueState()
      console.log('Created new queue state file')
    }
  } catch (error) {
    console.error('Error loading queue state:', error)
  }
}

// Save queue state to disk
function saveQueueState(): void {
  try {
    fs.writeFileSync(QUEUE_STATE_FILE, JSON.stringify(queueState, null, 2), 'utf8')
  } catch (error) {
    console.error('Error saving queue state:', error)
  }
}

function createSingleWindow(screen: 'customer' | 'display' | 'employee' | 'admin', counterId?: number) {
  let win: BrowserWindow

  win = new BrowserWindow({
    width: screen === 'display' ? 900 : 600,
    height: screen === 'display' ? 700 : 600,
    title:
      screen === 'customer'
        ? 'شاشة العملاء'
        : screen === 'display'
        ? 'شاشة العرض'
        : screen === 'employee'
        ? `شاشة الموظف${counterId ? ' - مكتب ' + counterId : ''}`
        : 'لوحة تحكم الأدمن',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())
  win.on('closed', () => (win = null!))

  // تحديد عنوان URL للنافذة
  let url: string
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    // Make absolutely sure the screen parameter is passed correctly
    url = `${process.env['ELECTRON_RENDERER_URL']}?screen=${screen}`
    if (screen === 'employee' && counterId) url += `&counter=${counterId}`

    console.log(`Loading URL: ${url}`) // Add logging to debug
    win.loadURL(url)
  } else {
    url = join(__dirname, '../renderer/index.html')
    if (screen === 'employee' && counterId) {
      win.loadFile(url, { hash: `employee/${counterId}` })
    } else {
      win.loadFile(url, { hash: screen })
    }
  }

  return win
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Setup IPC for queue data synchronization
  setupIPC()

  // Check if we're in development mode
  const isDevelopment = process.env.NODE_ENV === 'development' || is.dev

  // Log database status
  if (db.dbInfo) {
    console.log(`Database status: ${db.dbInfo.isFreshStart ? 'Fresh start' : 'Existing data'}`)
    console.log(`Database location: ${db.dbInfo.dataFolder}`)
  }

  // Load saved queue state
  loadQueueState()

  // Check if we should start multiple windows for development
  const launchAllScreens = process.env.LAUNCH_ALL_SCREENS === 'true';

  if (launchAllScreens && isDevelopment) {
    // Create multiple windows for development
    console.log('Launching all screens for development...')

    // Use our sequential window creation function
    createSequentialWindows();
  } else {
    // Normal single window mode
    const screenType = process.env.SCREEN_TYPE || 'customer';
    const counterId = process.env.COUNTER_ID ? parseInt(process.env.COUNTER_ID, 10) : undefined;

    console.log(`Starting single window with screen type: ${screenType}`);
    const mainWindow = createSingleWindow(screenType as any, counterId);

    // Open DevTools in development mode
    if (isDevelopment) {
      mainWindow.webContents.openDevTools();
    }

    // If this is an employee window, store it in the map
    if (screenType === 'employee' && counterId) {
      employeeWindows.set(counterId, mainWindow);
    }
  }
})

// Add IPC handler for creating new employee window
ipcMain.handle('create-employee-window', (_, counterId) => {
  // Check if the counter ID already has a window
  if (!employeeWindows.has(counterId)) {
    createSingleWindow('employee', counterId)
    return { success: true }
  }
  return { success: false, error: 'Window already exists for this counter' }
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Cleanup on app exit
app.on('will-quit', () => {
  saveQueueState();
  stopServer(); // Stop the Express server
})

// Setup IPC communication for queue data
function setupIPC(): void {
  // Get network info
  ipcMain.handle('get-network-info', () => {
    return {
      localIp: getLocalIpAddress(),
      isConnected: true,  // Now we're always "connected" since this is local
      serverUrl: null     // No server is needed anymore
    }
  })

  // Handle resource path requests
  ipcMain.handle('get-resource-path', (_, resourceName) => {
    const resourcePath = join(__dirname, '../../resources', resourceName)
    return resourcePath
  })

  // For compatibility: these functions don't do anything meaningful anymore
  ipcMain.handle('connect-to-websocket-server', async () => {
    return { success: true }
  })

  ipcMain.handle('disconnect-from-websocket-server', async () => {
    return { success: true }
  })

  // Start socket server
  ipcMain.handle('start-local-server', async () => {
    try {
      const result = await startServer(4000, (newState) => {
        // This callback will be called whenever the queue state changes
        // We can save the state to disk here for persistence
        Object.assign(queueState, newState);
        saveQueueState();
      });
      
      // Initialize the server with our current state
      setInitialState(queueState);
      
      return {
        success: true,
        url: `http://${result.localIp}:4000`,
        port: 4000
      };
    } catch (error) {
      console.error('Failed to start server:', error);
      return {
        success: false,
        error: String(error)
      };
    }
  })

  // Improved implementation to prevent unnecessary updates
  let lastQueueStateCall = 0;
  let pendingQueueStatePromise: Promise<any> | null = null;
  let lastQueueStateString: string = ''; // for comparison
  let employeeWindows = new Set<number>(); // Track which employee windows are open

  ipcMain.handle('get-queue-state', (event) => {
    const now = Date.now();

    // Get the sender's window to check if it's an employee window
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const isEmployeeWindow = senderWindow &&
      Array.from(employeeWindows.values()).includes(senderWindow.id);

    // Apply more aggressive throttling for employee windows
    const throttleTime = isEmployeeWindow ? 3000 : 1000;

    // Only allow a new request based on throttle time, otherwise return the last promise
    if (now - lastQueueStateCall < throttleTime && pendingQueueStatePromise) {
      return pendingQueueStatePromise;
    }

    lastQueueStateCall = now;

    // Return current state
    const currentStateString = JSON.stringify({
      tickets: queueState.tickets.map(t => ({
        id: t.id,
        status: t.status,
        counterNumber: t.counterNumber
      })),
      counters: queueState.counters,
      lastTicketNumber: queueState.lastTicketNumber
    });

    // Check if state has meaningfully changed
    if (currentStateString === lastQueueStateString) {
      // No change, return same state without serializing again
      return Promise.resolve(queueState);
    }

    // State has changed
    lastQueueStateString = currentStateString;
    pendingQueueStatePromise = Promise.resolve(queueState);

    // Clear the pending promise after the throttle time
    setTimeout(() => {
      pendingQueueStatePromise = null;
    }, throttleTime);

    return pendingQueueStatePromise;
  });

  // Add a new ticket - with optimized broadcasting
  ipcMain.handle('add-ticket', (_, serviceType = 'general', customerName = '') => {
    // Create new ticket
    const newTicketNumber = queueState.lastTicketNumber + 1
    const newTicket = {
      id: newTicketNumber,
      timestamp: Date.now(),
      status: 'waiting',
      serviceType: serviceType || 'general',
      customerName
    }

    queueState.tickets.push(newTicket)
    queueState.lastTicketNumber = newTicketNumber

    // Notify only relevant windows of the state change
    broadcastQueueStateFiltered(['customer', 'display']);
    saveQueueState();

    return newTicket;
  });

  // Call next customer - with optimized broadcasting
  ipcMain.handle('call-next-customer', (_, counterId) => {
    // Find the next waiting ticket
    const nextTicket = queueState.tickets.find((ticket) => ticket.status === 'waiting')
    if (!nextTicket) return null

    // Update ticket status
    queueState.tickets = queueState.tickets.map((ticket) =>
      ticket.id === nextTicket.id
        ? { ...ticket, status: 'serving', counterNumber: counterId }
        : ticket
    )

    // Update counter status
    queueState.counters = queueState.counters.map((counter) =>
      counter.id === counterId ? { ...counter, busy: true, currentTicket: nextTicket.id } : counter
    )

    // Notify all windows of the state change
    broadcastQueueState();
    saveQueueState();

    return nextTicket;
  });

  // Complete service
  ipcMain.handle('complete-service', (_, counterId) => {
    const counter = queueState.counters.find((c) => c.id === counterId)
    if (!counter || counter.currentTicket === null) return { success: false }

    // Update ticket status
    queueState.tickets = queueState.tickets.map((ticket) =>
      ticket.id === counter.currentTicket ? { ...ticket, status: 'complete' } : ticket
    )

    // Update counter status
    queueState.counters = queueState.counters.map((counter) =>
      counter.id === counterId ? { ...counter, busy: false, currentTicket: null } : counter
    )

    // Notify all windows of the state change
    broadcastQueueState();
    saveQueueState();

    return { success: true }
  });

  // Update counter status
  ipcMain.handle('update-counter-status', (_, counterId, status) => {
    // Update counter status
    queueState.counters = queueState.counters.map((counter) =>
      counter.id === counterId ? { ...counter, status } : counter
    )

    // Notify all windows of the state change
    broadcastQueueState();
    saveQueueState();

    return { success: true }
  });

  // Admin DB APIs
  ipcMain.handle('db-get-services', () => db.getServices())
  ipcMain.handle('db-add-service', (_, name, type) => db.addService(name, type))
  ipcMain.handle('db-delete-service', (_, id) => db.deleteService(id))
  ipcMain.handle('db-get-tickets', () => db.getTickets())
  ipcMain.handle('db-add-ticket', (_, ticket) => db.addTicket(ticket))
  ipcMain.handle('db-update-ticket-status', (_, id, status) => db.updateTicketStatus(id, status))
  ipcMain.handle('db-get-counters', () => db.getCounters())
  ipcMain.handle('db-update-counter', (_, id, status, busy, currentTicket) => db.updateCounter(id, status, busy, currentTicket))
  ipcMain.handle('db-get-analytics', () => db.getAnalytics())
  ipcMain.handle('db-get-today-stats', () => db.getTodayStats())

  // Clear database (for development only)
  ipcMain.handle('db-clear-database', () => {
    if (process.env.NODE_ENV === 'development') {
      return db.clearDatabase()
    }
    return { success: false, error: 'Operation not allowed in production mode' }
  })

  // Get database info
  ipcMain.handle('db-get-info', () => {
    return db.dbInfo
  })

  // Broadcast queue state updates to all windows
  function broadcastQueueState(): void {
    try {
      // Get all windows
      const allWindows = BrowserWindow.getAllWindows();

      // Update our serialized state for future comparison
      lastQueueStateString = JSON.stringify({
        tickets: queueState.tickets.map(t => ({
          id: t.id,
          status: t.status,
          counterNumber: t.counterNumber
        })),
        counters: queueState.counters,
        lastTicketNumber: queueState.lastTicketNumber
      });

      // Only send to windows that are ready to show
      allWindows.forEach(window => {
        if (!window.isDestroyed() && window.isVisible()) {
          window.webContents.send('queue-state-updated', queueState);

          // Track employee windows
          const title = window.getTitle();
          if (title.includes('شاشة الموظف')) {
            employeeWindows.add(window.id);
          }
        }
      });

      // Also update the socket server state
      updateQueueState(queueState);

      // Save state to disk for persistence
      saveQueueState();
    } catch (error) {
      console.error('Error broadcasting queue state:', error);
    }
  }

  // Broadcast only to specific screen types
  function broadcastQueueStateFiltered(screenTypes: string[]): void {
    try {
      // Get all windows
      const allWindows = BrowserWindow.getAllWindows();

      // Update our serialized state for future comparison
      lastQueueStateString = JSON.stringify({
        tickets: queueState.tickets.map(t => ({
          id: t.id,
          status: t.status,
          counterNumber: t.counterNumber
        })),
        counters: queueState.counters,
        lastTicketNumber: queueState.lastTicketNumber
      });

      // Only send to windows that match the screen types
      allWindows.forEach(window => {
        if (!window.isDestroyed() && window.isVisible()) {
          const title = window.getTitle().toLowerCase();
          const shouldSend = screenTypes.some(type => {
            switch(type) {
              case 'customer': return title.includes('شاشة العملاء');
              case 'display': return title.includes('شاشة العرض');
              case 'employee': return title.includes('شاشة الموظف');
              case 'admin': return title.includes('لوحة تحكم');
              default: return false;
            }
          });

          if (shouldSend) {
            window.webContents.send('queue-state-updated', queueState);
          }

          // Track employee windows
          if (title.includes('شاشة الموظف')) {
            employeeWindows.add(window.id);
          }
        }
      });

      // Also update the socket server state
      updateQueueState(queueState);

      // Save state to disk for persistence
      saveQueueState();
    } catch (error) {
      console.error('Error broadcasting filtered queue state:', error);
    }
  }
}

// Helper function to create windows with sequential delays
function createSequentialWindows() {
  console.log('Setting up sequential window creation...');

  // Map to store windows
  const windows = new Map();

  // Always start the Socket.IO server first for dev:all mode
  startServer(4000, (newState) => {
    // This callback will be called whenever the queue state changes
    Object.assign(queueState, newState);
    saveQueueState();
  }).then(({ localIp }) => {
    console.log(`Socket.IO server started on ${localIp}:4000`);

    // Initialize the server with our current state
    setInitialState(queueState);

    // Step 1: Create display window first (it's the central component)
    setTimeout(() => {
      console.log('Creating display window first...');
      const displayWindow = createSingleWindow('display');
      windows.set('display', displayWindow);

      // Step 2: Create customer window after display is set up
      setTimeout(() => {
        console.log('Creating customer window...');
        const mainWindow = createSingleWindow('customer');
        windows.set('customer', mainWindow);

        // Step 3: Create employee window
        setTimeout(() => {
          console.log('Creating employee window...');
          const employee1Window = createSingleWindow('employee', 1);
          employeeWindows.set(1, employee1Window);
          windows.set('employee1', employee1Window);

          // Step 4: Finally create admin window
          setTimeout(() => {
            console.log('Creating admin window...');
            const adminWindow = createSingleWindow('admin');
            windows.set('admin', adminWindow);

            // Position windows for better visibility during development
            const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;
            const halfWidth = Math.floor(width / 2);
            const halfHeight = Math.floor(height / 2);

            const win1 = windows.get('customer');
            if (win1) {
              win1.setPosition(0, 0);
              win1.setSize(halfWidth, halfHeight);
            }

            const win2 = windows.get('display');
            if (win2) {
              win2.setPosition(halfWidth, 0);
              win2.setSize(halfWidth, halfHeight);
            }

            const win3 = windows.get('employee1');
            if (win3) {
              win3.setPosition(0, halfHeight);
              win3.setSize(halfWidth, halfHeight);
            }

            const win4 = windows.get('admin');
            if (win4) {
              win4.setPosition(halfWidth, halfHeight);
              win4.setSize(halfWidth, halfHeight);
            }

            console.log('All windows launched successfully in sequential order')
          }, 500)
        }, 500)
      }, 500)
    }, 1000)
  });
}
