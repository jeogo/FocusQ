export interface Ticket {
  id: number
  timestamp: number
  status: string
  serviceType: string
  counterNumber?: number
  extraData?: Record<string, any>
}

export interface Counter {
  id: number
  busy: boolean
  currentTicket: number | null
  status: string
  extraData?: Record<string, any>
}

export interface QueueState {
  tickets: Ticket[]
  lastTicketNumber: number
  counters: Counter[]
  extraData?: Record<string, any>
}
