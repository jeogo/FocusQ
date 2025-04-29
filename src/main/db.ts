import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

// Database file paths
const DATA_FOLDER = path.join(
  app.getPath('userData'),
  'queue-data'
)

// Ensure the data folder exists
if (!fs.existsSync(DATA_FOLDER)) {
  fs.mkdirSync(DATA_FOLDER, { recursive: true })
}

const SERVICES_FILE = path.join(DATA_FOLDER, 'services.json')
const TICKETS_FILE = path.join(DATA_FOLDER, 'tickets.json')
const COUNTERS_FILE = path.join(DATA_FOLDER, 'counters.json')

// Check if this is a development environment with reset flag
const shouldResetDB = process.env.NODE_ENV === 'development' && process.env.RESET_DB === 'true'
if (shouldResetDB) {
  console.log('Development mode with reset flag - clearing database files')
  if (fs.existsSync(SERVICES_FILE)) fs.unlinkSync(SERVICES_FILE)
  if (fs.existsSync(TICKETS_FILE)) fs.unlinkSync(TICKETS_FILE)
  if (fs.existsSync(COUNTERS_FILE)) fs.unlinkSync(COUNTERS_FILE)
}

// Check if this is a fresh start
const isFreshStart = () => {
  return !fs.existsSync(SERVICES_FILE) ||
         !fs.existsSync(TICKETS_FILE) ||
         !fs.existsSync(COUNTERS_FILE)
}

// Initialize the database files if they don't exist
function initializeDb() {
  if (!fs.existsSync(SERVICES_FILE)) {
    const initialServices = [
      { id: 1, name: 'الخدمات العامة', type: 'general' },
      { id: 2, name: 'الخدمات المالية', type: 'financial' },
      { id: 3, name: 'الدعم الفني', type: 'technical' }
    ]
    fs.writeFileSync(SERVICES_FILE, JSON.stringify(initialServices, null, 2), 'utf8')
    console.log('Created services database with initial data')
  }

  if (!fs.existsSync(TICKETS_FILE)) {
    fs.writeFileSync(TICKETS_FILE, JSON.stringify([], null, 2), 'utf8')
    console.log('Created empty tickets database')
  }

  if (!fs.existsSync(COUNTERS_FILE)) {
    const initialCounters = [
      { id: 1, name: 'المكتب 1', status: 'active', busy: false, currentTicket: null },
      { id: 2, name: 'المكتب 2', status: 'active', busy: false, currentTicket: null },
      { id: 3, name: 'المكتب 3', status: 'active', busy: false, currentTicket: null }
    ]
    fs.writeFileSync(COUNTERS_FILE, JSON.stringify(initialCounters, null, 2), 'utf8')
    console.log('Created counters database with initial data')
  }
}

// Initialize database on module load
initializeDb()

// Services CRUD operations
export function getServices() {
  try {
    const data = fs.readFileSync(SERVICES_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error reading services:', error)
    return []
  }
}

export function addService(name, type) {
  try {
    const services = getServices()
    const newId = services.length > 0 ? Math.max(...services.map(s => s.id)) + 1 : 1
    const newService = { id: newId, name, type }
    services.push(newService)
    fs.writeFileSync(SERVICES_FILE, JSON.stringify(services, null, 2), 'utf8')
    return newService
  } catch (error) {
    console.error('Error adding service:', error)
    return null
  }
}

export function deleteService(id) {
  try {
    const services = getServices()
    const filteredServices = services.filter(s => s.id !== id)
    fs.writeFileSync(SERVICES_FILE, JSON.stringify(filteredServices, null, 2), 'utf8')
    return true
  } catch (error) {
    console.error('Error deleting service:', error)
    return false
  }
}

// Tickets CRUD operations
export function getTickets() {
  try {
    const data = fs.readFileSync(TICKETS_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error reading tickets:', error)
    return []
  }
}

// Update ticket status and set which counter is serving it
export function updateTicketStatusAndServer(ticketId, status, counterId) {
  try {
    const tickets = getTickets()
    const updatedTickets = tickets.map(ticket =>
      ticket.id === ticketId
        ? { ...ticket, status, counterNumber: counterId, servedByCounterId: counterId }
        : ticket
    )
    fs.writeFileSync(TICKETS_FILE, JSON.stringify(updatedTickets, null, 2), 'utf8')
    return true
  } catch (error) {
    console.error('Error updating ticket status and server:', error)
    return false
  }
}

// Get ticket by ID (enhanced to include servedByCounterId)
export function getTicketById(id) {
  const tickets = getTickets()
  const ticket = tickets.find(t => t.id === id)
  return ticket || null
}

export function addTicket(serviceType, customerName = '') {
  try {
    const tickets = getTickets()
    const newId = tickets.length > 0 ? Math.max(...tickets.map(t => t.id)) + 1 : 1

    // Generate ticket number (for display)
    const today = new Date()
    const datePrefix = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`
    const ticketNumber = `${datePrefix}-${newId.toString().padStart(3, '0')}`

    const newTicket = {
      id: newId,
      ticketNumber,
      serviceType,
      customerName,
      status: 'waiting',
      counterId: null,
      timestamp: Date.now(),
      calledTime: null,
      completedTime: null
    }

    tickets.push(newTicket)
    fs.writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2), 'utf8')
    return newTicket
  } catch (error) {
    console.error('Error adding ticket:', error)
    return null
  }
}

export function updateTicketStatus(id, status) {
  try {
    const tickets = getTickets()
    const updatedTickets = tickets.map(ticket => {
      if (ticket.id === id) {
        const updatedTicket = { ...ticket, status };

        // Add timestamp based on the status
        if (status === 'serving' && !ticket.calledTime) {
          updatedTicket.calledTime = Date.now();
        } else if (status === 'complete' && !ticket.completedTime) {
          updatedTicket.completedTime = Date.now();
        }

        return updatedTicket;
      }
      return ticket;
    });

    fs.writeFileSync(TICKETS_FILE, JSON.stringify(updatedTickets, null, 2), 'utf8')
    return true
  } catch (error) {
    console.error('Error updating ticket status:', error)
    return false
  }
}

export function updateTicketCounter(id, counterId) {
  try {
    const tickets = getTickets()
    const updatedTickets = tickets.map(ticket =>
      ticket.id === id ? { ...ticket, counterId } : ticket
    )
    fs.writeFileSync(TICKETS_FILE, JSON.stringify(updatedTickets, null, 2), 'utf8')
    return true
  } catch (error) {
    console.error('Error updating ticket counter:', error)
    return false
  }
}

// Counters CRUD operations
export function getCounters() {
  try {
    const data = fs.readFileSync(COUNTERS_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error reading counters:', error)
    return []
  }
}

export function getCounterById(id) {
  try {
    const counters = getCounters()
    return counters.find(counter => counter.id === id) || null
  } catch (error) {
    console.error('Error getting counter by ID:', error)
    return null
  }
}

export function addCounter() {
  try {
    const counters = getCounters()

    // If no counters exist, start with ID 1
    if (counters.length === 0) {
      const newCounter = {
        id: 1,
        name: 'المكتب 1',
        status: 'active',
        busy: false,
        currentTicket: null
      }
      counters.push(newCounter)
      fs.writeFileSync(COUNTERS_FILE, JSON.stringify(counters, null, 2), 'utf8')
      return newCounter
    }

    // Sort counters by ID to find sequential gaps
    const sortedCounters = [...counters].sort((a, b) => a.id - b.id)

    // Find the first gap in the sequence
    let newId = 1
    for (const counter of sortedCounters) {
      if (counter.id === newId) {
        newId++
      } else if (counter.id > newId) {
        // Found a gap
        break
      }
    }

    // Create new counter with the first available ID
    const newCounter = {
      id: newId,
      name: `المكتب ${newId}`,
      status: 'active',
      busy: false,
      currentTicket: null
    }

    counters.push(newCounter)
    fs.writeFileSync(COUNTERS_FILE, JSON.stringify(counters, null, 2), 'utf8')
    return newCounter
  } catch (error) {
    console.error('Error adding counter:', error)
    return null
  }
}

export function updateCounter(id, status, busy, currentTicket) {
  try {
    const counters = getCounters()
    const updatedCounters = counters.map(counter =>
      counter.id === id
        ? { ...counter, status, busy, currentTicket }
        : counter
    )
    fs.writeFileSync(COUNTERS_FILE, JSON.stringify(updatedCounters, null, 2), 'utf8')
    return true
  } catch (error) {
    console.error('Error updating counter:', error)
    return false
  }
}

// Analytics
export function getAnalytics() {
  try {
    const tickets = getTickets()
    const totalTickets = tickets.length
    const completed = tickets.filter(t => t.status === 'complete').length
    const waiting = tickets.filter(t => t.status === 'waiting').length
    const serving = tickets.filter(t => t.status === 'serving').length

    // Get service type distribution
    const serviceTypes = {}
    tickets.forEach(ticket => {
      if (!serviceTypes[ticket.serviceType]) {
        serviceTypes[ticket.serviceType] = 0
      }
      serviceTypes[ticket.serviceType]++
    })

    return {
      totalTickets,
      completed,
      waiting,
      serving,
      serviceTypes
    }
  } catch (error) {
    console.error('Error getting analytics:', error)
    return null
  }
}

// Get today's statistics
export function getTodayStats() {
  try {
    const tickets = getTickets()
    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()

    // Get today's tickets
    const todayTickets = tickets.filter(t => t.timestamp >= startOfDay)
    const totalToday = todayTickets.length

    // Get service type distribution for today
    const serviceTypes = {}
    todayTickets.forEach(ticket => {
      if (!serviceTypes[ticket.serviceType]) {
        serviceTypes[ticket.serviceType] = 0
      }
      serviceTypes[ticket.serviceType]++
    })

    // Convert to array format for easier rendering
    const perService = Object.keys(serviceTypes).map(type => ({
      serviceType: type,
      count: serviceTypes[type]
    }))

    return {
      totalToday,
      perService
    }
  } catch (error) {
    console.error('Error getting today stats:', error)
    return {
      totalToday: 0,
      perService: []
    }
  }
}

// Clear database (for development/testing)
export function clearDatabase() {
  try {
    // Create empty databases
    fs.writeFileSync(TICKETS_FILE, JSON.stringify([], null, 2), 'utf8')

    // Reinitialize services and counters
    const initialServices = [
      { id: 1, name: 'الخدمات العامة', type: 'general' },
      { id: 2, name: 'الخدمات المالية', type: 'financial' },
      { id: 3, name: 'الدعم الفني', type: 'technical' }
    ]
    fs.writeFileSync(SERVICES_FILE, JSON.stringify(initialServices, null, 2), 'utf8')

    const initialCounters = [
      { id: 1, name: 'المكتب 1', status: 'active', busy: false, currentTicket: null },
      { id: 2, name: 'المكتب 2', status: 'active', busy: false, currentTicket: null },
      { id: 3, name: 'المكتب 3', status: 'active', busy: false, currentTicket: null }
    ]
    fs.writeFileSync(COUNTERS_FILE, JSON.stringify(initialCounters, null, 2), 'utf8')

    console.log('Database cleared and reset to initial state')
    return true
  } catch (error) {
    console.error('Error clearing database:', error)
    return false
  }
}

// Get complete queue state
export function getQueueState() {
  try {
    return {
      tickets: getTickets(),
      counters: getCounters(),
      services: getServices()
    }
  } catch (error) {
    console.error('Error getting queue state:', error)
    return {
      tickets: [],
      counters: [],
      services: []
    }
  }
}

// Export the database paths for other components
export const dbInfo = {
  dataFolder: DATA_FOLDER,
  serviceFile: SERVICES_FILE,
  ticketsFile: TICKETS_FILE,
  countersFile: COUNTERS_FILE,
  isFreshStart: isFreshStart()
}
