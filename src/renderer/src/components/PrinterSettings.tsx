import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Printer, Check, AlertCircle } from 'lucide-react';
import { getSystemPrinters, PrinterInfo } from '../utils/printerUtils';

interface PrinterSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const PrinterSettings = ({ isOpen, onClose }: PrinterSettingsProps): JSX.Element => {
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // جلب الطابعات عند فتح النافذة
  useEffect(() => {
    const loadPrinters = async () => {
      if (!isOpen) return;

      setIsLoading(true);
      setError(null);

      try {
        console.log('Attempting to get system printers...');
        const printerList = await getSystemPrinters();
        console.log('Printers found:', printerList);

        setPrinters(printerList);

        if (printerList.length > 0) {
          const firstConnected = printerList.find(p => p.status === 'connected');
          setSelectedPrinter(firstConnected?.id || printerList[0].id);
        }
      } catch (err) {
        console.error('Failed to get printers:', err);
        setError('تعذر قراءة الطابعات من النظام. الرجاء التحقق من التالي:\n' +
                '- تأكد من تشغيل خدمة CUPS على Linux\n' +
                '- تأكد من وجود طابعات مثبتة على النظام\n' +
                '- تحقق من صلاحيات الوصول للطابعات');
      } finally {
        setIsLoading(false);
      }
    };

    loadPrinters();
  }, [isOpen]);

  const getStatusClass = (status: string): string => {
    switch (status) {
      case 'connected':
        return 'bg-green-100 text-green-800';
      case 'offline':
        return 'bg-gray-100 text-gray-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string): string => {
    switch (status) {
      case 'connected':
        return 'متصل';
      case 'offline':
        return 'غير متصل';
      case 'error':
        return 'خطأ';
      default:
        return 'غير معروف';
    }
  };

  const handleSave = () => {
    // This would typically save the printer settings
    // For design-only implementation, we just close the dialog
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800 flex items-center">
                <Printer className="ml-2" size={22} />
                إعدادات الطابعة
              </h2>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 transition-colors"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                اختر الطابعة الافتراضية:
              </label>
              <div className="space-y-3">
                {isLoading ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                    <p className="mt-2 text-gray-500">جاري البحث عن الطابعات...</p>
                  </div>
                ) : error ? (
                  <div className="text-center text-red-500 py-8">
                    {error}
                  </div>
                ) : printers.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="mx-auto h-12 w-12 text-yellow-500 mb-3" />
                    <p className="text-gray-600 font-medium mb-2">
                      لم يتم العثور على طابعات
                    </p>
                    <p className="text-sm text-gray-500 max-w-sm mx-auto">
                      تأكد من:
                      <br/>- تثبيت الطابعات على نظام التشغيل
                      <br/>- تشغيل خدمة الطباعة (CUPS على Linux)
                      <br/>- توصيل الطابعات وتشغيلها
                    </p>
                    <button
                      onClick={() => {
                        setIsLoading(true);
                        getSystemPrinters()
                          .then(setPrinters)
                          .finally(() => setIsLoading(false));
                      }}
                      className="mt-4 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      إعادة البحث عن الطابعات
                    </button>
                  </div>
                ) : (
                  printers.map((printer) => (
                    <div
                      key={printer.id}
                      className={`relative border rounded-lg p-4 cursor-pointer transition-all ${
                        selectedPrinter === printer.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => printer.status === 'connected' && setSelectedPrinter(printer.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div
                            className={`w-4 h-4 rounded-full ${
                              selectedPrinter === printer.id ? 'bg-blue-500' : 'bg-white border border-gray-300'
                            } flex items-center justify-center`}
                          >
                            {selectedPrinter === printer.id && <Check size={12} className="text-white" />}
                          </div>
                          <span className="mr-3 font-medium text-gray-800">{printer.name}</span>
                        </div>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusClass(
                            printer.status
                          )}`}
                        >
                          {getStatusText(printer.status)}
                        </span>
                      </div>
                      {printer.status === 'offline' && (
                        <p className="mt-2 text-sm text-gray-500 pr-7">
                          الطابعة غير متصلة. يرجى التحقق من الاتصال وإعادة المحاولة.
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  حفظ
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PrinterSettings;
