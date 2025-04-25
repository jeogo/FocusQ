import { useState, useEffect } from 'react';
import * as SocketClient from '../services/socket/client';

export default function ServerSettings({ onClose }: { onClose: () => void }) {
  const [serverIp, setServerIp] = useState('');
  const [serverPort, setServerPort] = useState('4000');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Load current settings
    const savedIp = localStorage.getItem('serverIp');
    const savedPort = localStorage.getItem('serverPort');
    
    if (savedIp) setServerIp(savedIp);
    if (savedPort) setServerPort(savedPort);
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      // Save to localStorage
      localStorage.setItem('serverIp', serverIp);
      localStorage.setItem('serverPort', serverPort);
      
      // Try connecting to validate
      await SocketClient.connectToServer({
        serverHost: serverIp,
        serverPort: parseInt(serverPort),
        reconnectionAttempts: 0,
        reconnectionDelay: 0,
        timeout: 0,
        heartbeatInterval: 0,
        heartbeatTimeout: 0
      });
      
      setMessage('تم الاتصال بالخادم بنجاح!');
      setTimeout(onClose, 1500);
    } catch (error) {
      setMessage('فشل الاتصال بالخادم. تأكد من صحة المعلومات.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">إعدادات الاتصال بالخادم</h2>
        
        <div className="mb-4">
          <label className="block text-gray-700 mb-2">عنوان IP الخادم</label>
          <input
            type="text"
            value={serverIp}
            onChange={e => setServerIp(e.target.value)}
            placeholder="192.168.1.x"
            className="w-full p-2 border rounded"
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-gray-700 mb-2">منفذ الخادم</label>
          <input
            type="text"
            value={serverPort}
            onChange={e => setServerPort(e.target.value)}
            placeholder="4000"
            className="w-full p-2 border rounded"
          />
        </div>
        
        {message && (
          <div className={`p-3 rounded mb-4 ${message.includes('فشل') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {message}
          </div>
        )}
        
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            إلغاء
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
          >
            {isSaving ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                جاري الحفظ...
              </>
            ) : 'حفظ الإعدادات'}
          </button>
        </div>
      </div>
    </div>
  );
}
