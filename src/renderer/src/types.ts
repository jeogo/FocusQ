export interface Ticket {
  id: number;
  timestamp: number;
  status: 'waiting' | 'serving' | 'complete' | 'cancelled';
  serviceType: string;
  counterNumber?: number;
  servedByCounterId?: number;
  customerName?: string;
  extraData?: Record<string, any>;
}

export interface Counter {
  id: number;
  busy: boolean;
  currentTicket: number | null;
  status: 'active' | 'inactive' | 'break';
  employeeName?: string;
  extraData?: Record<string, any>;
}

export interface QueueState {
  tickets: Ticket[];
  lastTicketNumber: number;
  counters: Counter[];
  extraData?: Record<string, any>;
}

export interface NetworkInfo {
  localIp: string;
  isConnected: boolean;
  serverUrl: string | null;
}

export interface SoundOptions {
  volume?: number;
  fadeIn?: boolean;
  fadeOut?: boolean;
}
