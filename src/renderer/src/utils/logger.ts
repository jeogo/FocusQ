// Logger utility to capture errors and warnings
// Usage: import './logger' in your main entry point (main.tsx)

const logs: { type: string; message: any[]; timestamp: string }[] = [];

function logAndStore(type: string, ...args: any[]) {
  logs.push({
    type,
    message: args,
    timestamp: new Date().toISOString(),
  });
  // Optionally, send logs to a server or file here
}

const originalError = console.error;
const originalWarn = console.warn;

console.error = (...args: any[]) => {
  logAndStore('error', ...args);
  originalError(...args);
};

console.warn = (...args: any[]) => {
  logAndStore('warn', ...args);
  originalWarn(...args);
};

// Export logs for later retrieval if needed
export function getCapturedLogs() {
  return logs;
}
