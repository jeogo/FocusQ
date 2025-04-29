import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import { useSound } from '../../hooks/useSound';
import { Ticket } from '../../types';

interface TicketAnnouncerProps {
  ticket: Ticket | null;
  onAnnouncementComplete: () => void;
  isActive: boolean;
}

export const TicketAnnouncer: React.FC<TicketAnnouncerProps> = ({
  ticket,
  onAnnouncementComplete,
  isActive
}) => {
  const [isAnnouncing, setIsAnnouncing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const { playSequence, error: soundError, stopAllSounds } = useSound();
  const lastAnnouncedTicketId = useRef<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // إعلان صوتي عن التذكرة
  useEffect(() => {
    if (!ticket || !isActive || isMuted ||
        ticket.id === lastAnnouncedTicketId.current ||
        isAnnouncing) {
      return;
    }

    const announceTicket = async () => {
      try {
        setIsAnnouncing(true);
        setErrorMessage(null);
        lastAnnouncedTicketId.current = ticket.id;

        // بناء مسارات الصوت
        const soundPaths = [
          '/sounds/ticket-called.mp3',
          `/sounds/numbers/${ticket.id}.mp3`,
          '/sounds/to-counter.mp3',
          `/sounds/counters/${ticket.counterNumber || 1}.mp3`
        ];

        // تشغيل تتابع الأصوات
        await playSequence(soundPaths);

        // الانتظار لفترة قصيرة قبل إنهاء الإعلان
        setTimeout(() => {
          setIsAnnouncing(false);
          onAnnouncementComplete();
        }, 1000);
      } catch (error) {
        console.error('خطأ في الإعلان الصوتي:', error);
        setErrorMessage(error instanceof Error ? error.message : 'خطأ في تشغيل الإعلان الصوتي');
        setIsAnnouncing(false);
        onAnnouncementComplete();
      }
    };

    announceTicket();
  }, [ticket, isActive, isMuted, playSequence, onAnnouncementComplete]);

  // إيقاف الإعلانات عند إزالة المكون
  useEffect(() => {
    return () => {
      stopAllSounds();
    };
  }, [stopAllSounds]);

  // تبديل حالة كتم الصوت
  const toggleMute = () => {
    if (isAnnouncing) {
      stopAllSounds();
      setIsAnnouncing(false);
      onAnnouncementComplete();
    }
    setIsMuted(!isMuted);
  };

  return (
    <div className="fixed bottom-12 left-4 z-50">
      {/* زر كتم الصوت */}
      <motion.button
        onClick={toggleMute}
        whileTap={{ scale: 0.95 }}
        className={`flex items-center gap-2 rounded-full p-3 shadow-lg transition-colors ${
          isMuted ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
        }`}
      >
        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        <span className="text-sm">
          {isMuted ? 'الإعلانات متوقفة' : isAnnouncing ? 'جاري الإعلان...' : 'الإعلانات مفعلة'}
        </span>
      </motion.button>

      {/* رسالة خطأ الصوت */}
      {(soundError || errorMessage) && !isMuted && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 flex items-center gap-2 rounded bg-red-600 p-2 text-sm text-white"
        >
          <AlertTriangle size={16} />
          <span>خطأ: {errorMessage || soundError?.message || 'مشكلة في ملفات الصوت'}</span>
        </motion.div>
      )}
    </div>
  );
};
