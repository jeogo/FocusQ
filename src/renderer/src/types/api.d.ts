/* eslint-disable @typescript-eslint/no-explicit-any */
import { Ticket, Counter, QueueState } from '../types';

export interface NetworkInfo {
  localIp: string;
  isConnected?: boolean;
  serverPort?: number;
  [key: string]: any; // Allow additional properties
}

export interface QueueAPI {
  requestCounterId(): unknown;
  getQueueState: () => Promise<QueueState>;
  addTicket: (serviceType: string, customerName?: string) => Promise<Ticket>;
  callNextCustomer: (counterId: number) => Promise<Ticket | null>;
  completeService: (counterId: number) => Promise<void>;
  updateCounterStatus: (counterId: number, status: 'active' | 'inactive') => Promise<any>;
  createEmployeeWindow: (counterId: number) => Promise<any>;
  onQueueStateUpdated: (callback: (data: any) => void) => () => void;
  connectToServer: (serverUrl?: string) => Promise<any>;
  disconnectFromServer: () => Promise<void>;
  startLocalServer: () => Promise<any>;
}

export interface AdminDbAPI {
  updateService(id: number, name: string, type: string): unknown;
  updateService: any;
  getServices: () => Promise<any[]>;
  addService: (name: string, type: string) => Promise<any>;
  deleteService: (id: number) => Promise<void>;
  getTickets: () => Promise<any[]>;
  addTicket: (ticket: any) => Promise<any>;
  updateTicketStatus: (id: number, status: string) => Promise<void>;
  getCounters: () => Promise<any[]>;
  updateCounter: (id: number, status: string, busy: boolean|number, currentTicket: number | null) => Promise<void>;
  getAnalytics: () => Promise<any>;
  getTodayStats: () => Promise<any>;
  clearDatabase: () => Promise<void>;
  getDbInfo: () => Promise<any>;
}

export interface ResourcesAPI {
  writeFile(configPath: string, arg1: string): unknown;
  getPlatform(): unknown;
  getResourcePath: (resourceName: string) => Promise<string>;
}

export interface API {
  printer: any;
  config: any;
  display: any;
  startLocalServer(): unknown;
  getNetworkInfo: () => Promise<NetworkInfo>;
  queue: QueueAPI;
  adminDb: AdminDbAPI;
  resources: ResourcesAPI;
}

declare global {
  interface Window {
    api: API;
  }
}
