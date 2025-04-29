import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as os from 'os'
import * as fs from 'fs'
import * as db from './db'
import { startServer, stopServer, updateQueueState, setInitialState } from './socket/express-server'
import {
  ensureStorageFolder,
  loadData,
  saveData,
  saveAllPendingData
} from './optimizedStorage'

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

// قيمة افتراضية للطابور
const defaultQueueState: QueueState = {
  tickets: [],
  lastTicketNumber: 0,
  counters: [{ id: 1, busy: false, currentTicket: null, status: 'active' }],
  extraData: {}
}

// حالة الطابور المخزنة في الذاكرة
let queueState: QueueState = { ...defaultQueueState }

// اسم ملف حفظ حالة الطابور
const QUEUE_STATE_FILENAME = 'queue-state.json'

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

// تحميل حالة الطابور من التخزين - أصبحت غير متزامنة
async function loadQueueState(): Promise<void> {
  try {
    const loadedState = await loadData<QueueState>(QUEUE_STATE_FILENAME, defaultQueueState);

    // دمج الحالة المحملة مع الحالة الافتراضية
    queueState = {
      ...defaultQueueState,
      ...loadedState,
      // التأكد من وجود خصائص إضافية قد تكون أضيفت في إصدارات أحدث
      extraData: {
        ...defaultQueueState.extraData,
        ...(loadedState.extraData || {})
      }
    }

    console.log('تم تحميل حالة الطابور من التخزين');
  } catch (error) {
    console.error('خطأ في تحميل حالة الطابور:', error);
    // في حالة الخطأ، استخدام الحالة الافتراضية
    queueState = { ...defaultQueueState };
    // حفظ الحالة الافتراضية للاستخدام المستقبلي
    saveQueueState();
  }
}

// حفظ حالة الطابور - أصبحت تستخدم نظام التخزين المحسن
function saveQueueState(): void {
  try {
    saveData(QUEUE_STATE_FILENAME, queueState);
  } catch (error) {
    console.error('خطأ في حفظ حالة الطابور:', error);
  }
}

function createSingleWindow(screen: 'customer' | 'display' | 'employee' | 'admin', counterId?: number, displayId?: number) {
  let win: BrowserWindow

  // Build window title - now includes display ID when applicable
  const title =
    screen === 'display' ? `شاشة العرض${displayId ? ` ${displayId}` : ''}`
    : screen === 'customer' ? 'شاشة العملاء'
    : screen === 'employee' ? `شاشة الموظف${counterId ? ' - مكتب ' + counterId : ''}`
    : 'لوحة تحكم الأدمن';

  win = new BrowserWindow({
    width: screen === 'display' ? 900 : 600,
    height: screen === 'display' ? 700 : 600,
    title,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    let url = process.env['ELECTRON_RENDERER_URL'];

    // Add screen type and IDs as URL parameters
    url += `?screen=${screen}`;
    if (counterId) url += `&counter=${counterId}`;
    if (displayId) url += `&display=${displayId}`;

    win.loadURL(url);
  } else {
    win.loadFile('index.html', {
      // In production, use the resources from the app's path
      // removed 'pathname' property
      hash: `#${screen}`
    });
  }

  return win
}

// Helper function to find next available display ID
function getNextDisplayId(): number {
  const displayWindows = BrowserWindow.getAllWindows().filter(win =>
    win.getTitle().toLowerCase().includes('شاشة العرض')
  );

  let highestId = 0;
  displayWindows.forEach(win => {
    const match = win.getTitle().match(/شاشة العرض (\d+)/);
    if (match) {
      const id = parseInt(match[1], 10);
      if (id > highestId) highestId = id;
    }
  });

  return highestId + 1;
}

// Function to create new display screen with next available ID
function createNewDisplayScreen() {
  const nextId = getNextDisplayId();
  createSingleWindow('display', undefined, nextId);
  return nextId;
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // تهيئة مجلد التخزين
  await ensureStorageFolder();

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

  // تحميل حالة الطابور المحفوظة بشكل غير متزامن
  await loadQueueState()

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

  // Create application menu with display options
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'New Display Screen',
          click: () => {
            createNewDisplayScreen();
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    // Add other menu items as needed
  ]);

  Menu.setApplicationMenu(menu);
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
app.on('will-quit', async () => {
  // حفظ أي بيانات معلقة قبل الإغلاق
  await saveAllPendingData();
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

  // Check if resource exists
  ipcMain.handle('check-resource-exists', (_, resourcePath) => {
    const possiblePaths: string[] = [];

    if (is.dev) {
      // In development, check multiple paths
      possiblePaths.push(
        join(__dirname, '../../renderer/public', resourcePath),
        join(__dirname, '../../public', resourcePath),
        join(__dirname, '../../resources', resourcePath)
      );
    } else {
      // In production
      possiblePaths.push(
        join(process.resourcesPath, resourcePath)
      );
    }

    // Check each path
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        console.log(`Resource found at: ${path}`);
        return true;
      }
    }

    console.warn(`Resource not found: ${resourcePath}`);
    return false;
  });

  // Handle resource path requests with improved path resolution
  ipcMain.handle('get-resource-path', (_, resourcePath) => {
    const possiblePaths: string[] = [];

    if (is.dev) {
      // In development, check multiple paths
      possiblePaths.push(
        join(__dirname, '../../renderer/public', resourcePath),
        join(__dirname, '../../public', resourcePath),
        join(__dirname, '../../resources', resourcePath)
      );
    } else {
      // In production
      possiblePaths.push(
        join(process.resourcesPath, resourcePath)
      );
    }

    // Return the first path that exists
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        console.log(`Resource found at: ${path}`);
        return path;
      }
    }

    console.warn(`Resource not found: ${resourcePath}`);
    return null;
  });

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

  // تحسين معالجة طلبات حالة الطابور
  let lastQueueStateCall = 0;
  let pendingQueueStatePromise: Promise<any> | null = null;
  let lastQueueStateString: string = '';
  let employeeWindows = new Set<number>();

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

  // Add a new ticket - with optimized saveQueueState
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

  // Get next available counter ID
  ipcMain.handle('get-next-counter-id', () => {
    try {
      // Get all counters from db
      const counters = db.getCounters();

      // If no counters exist, return 1
      if (counters.length === 0) {
        return 1;
      }

      // Sort counters by ID to find sequential gaps
      const sortedCounters = [...counters].sort((a, b) => a.id - b.id);

      // Find the first gap in the sequence
      let nextId = 1;
      for (const counter of sortedCounters) {
        if (counter.id === nextId) {
          nextId++;
        } else if (counter.id > nextId) {
          // Found a gap
          break;
        }
      }

      console.log(`Next available counter ID: ${nextId}`);
      return nextId;
    } catch (error) {
      console.error('Error getting next counter ID:', error);
      return 1; // Default to 1 if there's an error
    }
  });

  // كتابة حالة الطابور إلى القرص باستخدام نظام التخزين المحسن
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

      // وقت محدد لحفظ البيانات بعد تحديث الحالة
      saveQueueState();
    } catch (error) {
      console.error('Error broadcasting queue state:', error)
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
      console.error('Error broadcasting filtered queue state:', error)
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
      const displayWindow = createSingleWindow('display', undefined, 1); // Always start with ID 1
      windows.set('display', displayWindow);

      // Step 2: Create customer window
      setTimeout(() => {
        console.log('Creating customer window...');
        const customerWindow = createSingleWindow('customer');
        windows.set('customer', customerWindow);

        // Step 3: Create employee window
        setTimeout(() => {
          console.log('Creating employee window...');
          const employeeWindow = createSingleWindow('employee', 1); // Counter ID 1
          windows.set('employee', employeeWindow);
          employeeWindows.set(1, employeeWindow);

          // Step 4: Create admin window
          setTimeout(() => {
            console.log('Creating admin window...');
            const adminWindow = createSingleWindow('admin');
            windows.set('admin', adminWindow);

            // Create additional display screens if needed
            const additionalDisplays = parseInt(process.env.ADDITIONAL_DISPLAYS || '0', 10);
            for (let i = 2; i <= additionalDisplays + 1; i++) {
              setTimeout(() => {
                console.log(`Creating additional display window ${i}...`);
                createSingleWindow('display', undefined, i);
              }, (i - 1) * 500); // Stagger creation
            }
          }, 500);
        }, 500);
      }, 500);
    }, 500);
  });
}
