/**
 * أدوات الطابعة: قراءة الطابعات المتصلة عبر النظام
 */

export interface PrinterInfo {
  id: string;
  name: string;
  status: 'connected' | 'offline' | 'error';
}

/**
 * قراءة قائمة الطابعات المتصلة بالنظام (عبر درايفر النظام)
 */
export async function getSystemPrinters(): Promise<PrinterInfo[]> {
  console.log('Getting system printers...');

  // 1. Try Electron API first
  if (window.api?.printer?.getPrinters) {
    try {
      console.log('Using Electron printer API...');
      const printers = await window.api.printer.getPrinters();
      console.log('Printers found via Electron:', printers);
      return printers.map((p: any) => ({
        id: p.deviceId || p.name,
        name: p.name,
        status: p.status === 'online' || p.status === 'connected' ? 'connected'
          : p.status === 'offline' ? 'offline'
          : 'error'
      }));
    } catch (e) {
      console.error('Error getting printers via Electron:', e);
    }
  }

  // 2. Try system commands if we're in Electron
  if (typeof window !== 'undefined' && (window as any).require) {
    try {
      console.log('Falling back to system commands...');
      const os = (window as any).require('os');
      const cp = (window as any).require('child_process');
      const util = (window as any).require('util');
      const exec = util.promisify(cp.exec);

      const platform = os.platform();
      console.log('Detected platform:', platform);

      if (platform === 'win32') {
        const { stdout } = await exec('wmic printer get name, status /FORMAT:CSV');
        const lines = stdout.split('\n').slice(1); // Skip header
        const printers = lines
          .filter(line => line.trim())
          .map(line => {
            const [name, status] = line.split(',').map(s => s.trim());
            return {
              id: name,
              name,
              status: status?.toLowerCase().includes('idle') ? 'connected' : 'offline'
            } as PrinterInfo;
          });
        console.log('Windows printers found:', printers);
        return printers;
      }
      else if (platform === 'linux') {
        // Try multiple Linux commands
        try {
          // Try lpstat first
          const { stdout } = await exec('lpstat -a');
          const printers = stdout.split('\n')
            .filter(line => line.trim())
            .map(line => {
              const name = line.split(' ')[0];
              return {
                id: name,
                name,
                status: 'connected'
              } as PrinterInfo;
            });

          if (printers.length > 0) {
            console.log('Linux printers found via lpstat:', printers);
            return printers;
          }
        } catch (e) {
          console.log('lpstat failed, trying lpc status...');
          // Try lpc status as fallback
          try {
            const { stdout } = await exec('lpc status');
            const printers = stdout.split('\n')
              .filter(line => line.includes(':'))
              .map(line => {
                const name = line.split(':')[0].trim();
                return {
                  id: name,
                  name,
                  status: 'connected'
                } as PrinterInfo;
              });
            console.log('Linux printers found via lpc:', printers);
            return printers;
          } catch (e) {
            console.error('All Linux printer detection methods failed:', e);
          }
        }
      }
      else if (platform === 'darwin') {
        const { stdout } = await exec('lpstat -p');
        const printers = stdout.split('\n')
          .filter(line => line.startsWith('printer'))
          .map(line => {
            const name = line.split(' ')[1];
            return {
              id: name,
              name,
              status: 'connected'
            } as PrinterInfo;
          });
        console.log('macOS printers found:', printers);
        return printers;
      }
    } catch (e) {
      console.error('Error detecting printers via system commands:', e);
    }
  }

  console.log('No printers found or running in browser mode');
  return [];
}
