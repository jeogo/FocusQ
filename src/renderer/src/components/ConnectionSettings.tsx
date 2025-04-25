import { useState } from 'react';
import { motion } from 'framer-motion';
import * as SocketClient from '../services/socket/client';
import { SERVER_CONFIG } from '../config/serverConfig';

export default function ConnectionSettings({ onClose }: { onClose: () => void }) {
  const [serverIp, setServerIp] = useState(SERVER_CONFIG.SERVER_HOST);
  const [serverPort, setServerPort] = useState(SERVER_CONFIG.SERVER_PORT.toString());
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setMessage('');
      
      // Try connecting to validate
      await SocketClient.connectToServer({
        serverHost: serverIp,
        serverPort: parseInt(serverPort),
        reconnectionAttempts: 15,
        reconnectionDelay: 1000,
        timeout: 10000,
        heartbeatInterval: 10000,
        heartbeatTimeout: 5000
      });
      
      setMessage('تم الاتصال بالخادم بنجاح!');
      setTimeout(onClose, 1500);
    } catch (error) {
      setMessage('فشل الاتصال بالخادم. تأكد من صحة المعلومات وأن الخادم يعمل.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <motion.div 
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md" 
        onClick={e => e.stopPropagation()}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        <h2 className="text-xl font-bold mb-4">إعدادات الاتصال بالخادم</h2>
        
        <div className="mb-4">
          <label className="block text-gray-700 mb-2">عنوان IP الخادم</label>
          <input
            type="text"
            value={serverIp}
            onChange={e => setServerIp(e.target.value)}
            placeholder="192.168.1.14"
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
        
        <div className="mb-6 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
          <p className="text-yellow-800 font-medium">ملاحظة هامة:</p>
          <p className="text-yellow-700 text-sm mt-1">
            عنوان الخادم المركزي الحالي هو {SERVER_CONFIG.SERVER_HOST}:{SERVER_CONFIG.SERVER_PORT}.
            تغيير الإعدادات هنا سيؤثر فقط على هذا الجهاز ولمدة هذه الجلسة.
          </p>
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
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin ml-2"></span>
                جاري الحفظ...
              </>
            ) : 'حفظ الإعدادات'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
