import { useState, useCallback, useEffect, useRef } from 'react';

interface UseSoundReturn {
  playSound: (url: string) => Promise<void>;
  playSequence: (urls: string[], delay?: number) => Promise<void>;
  loadSound: (url: string) => Promise<boolean>;
  isLoaded: boolean;
  error: Error | null;
  stopAllSounds: () => void;
}

export function useSound(): UseSoundReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());
  const isPlayingRef = useRef<boolean>(false);

  // تنظيف عند إزالة المكون
  useEffect(() => {
    return () => {
      stopAllSounds();
      audioCache.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      audioCache.current.clear();
    };
  }, []);

  // إيقاف جميع الأصوات
  const stopAllSounds = useCallback(() => {
    audioCache.current.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    isPlayingRef.current = false;
  }, []);

  // تحميل ملف صوتي مع دعم الكاش
  const loadSound = useCallback(async (url: string): Promise<boolean> => {
    try {
      setError(null);

      // التحقق إذا كان الملف موجود بالفعل في الكاش
      if (audioCache.current.has(url)) {
        setIsLoaded(true);
        return true;
      }

      // @ts-expect-error: custom electron preload
      const exists = await window.electron?.ipcRenderer?.invoke('check-resource-exists', url);

      if (!exists) {
        throw new Error(`ملف الصوت غير موجود: ${url}`);
      }

      // @ts-expect-error: custom electron preload
      const resourcePath = await window.electron?.ipcRenderer?.invoke('get-resource-path', url);

      if (!resourcePath) {
        throw new Error(`لا يمكن العثور على مسار الملف: ${url}`);
      }

      // إنشاء عنصر صوت جديد
      const newAudio = new Audio();

      // انتظار تحميل الملف
      return new Promise((resolve) => {
        newAudio.addEventListener('canplaythrough', () => {
          audioCache.current.set(url, newAudio);
          setIsLoaded(true);
          resolve(true);
        }, { once: true });

        newAudio.addEventListener('error', (e) => {
          setError(new Error(`فشل تحميل الصوت: ${e.toString()}`));
          setIsLoaded(false);
          resolve(false);
        }, { once: true });

        // استخدام مسار الملف المحلي أو مسار URL
        newAudio.src = resourcePath.startsWith('http') ? resourcePath : `file://${resourcePath}`;
        newAudio.load();
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setIsLoaded(false);
      console.error('خطأ في تحميل الصوت:', err);
      return false;
    }
  }, []);

  // تشغيل ملف صوتي
  const playSound = useCallback(async (url: string): Promise<void> => {
    try {
      setError(null);

      // تحميل الصوت إذا لم يكن موجودًا في الكاش
      if (!audioCache.current.has(url)) {
        const loaded = await loadSound(url);
        if (!loaded) {
          throw new Error('فشل تحميل الصوت');
        }
      }

      const audioToPlay = audioCache.current.get(url);
      if (!audioToPlay) {
        throw new Error('الصوت غير موجود في الكاش');
      }

      // إعادة ضبط الصوت للتشغيل من البداية
      audioToPlay.currentTime = 0;
      isPlayingRef.current = true;

      // تشغيل الصوت
      try {
        await audioToPlay.play();

        // الانتظار حتى نهاية الصوت
        return new Promise<void>((resolve) => {
          const handleEnded = () => {
            audioToPlay.removeEventListener('ended', handleEnded);
            resolve();
          };

          audioToPlay.addEventListener('ended', handleEnded);
        });
      } catch (e) {
        console.error('فشل تشغيل الصوت:', e);
        throw e;
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      console.error('خطأ في تشغيل الصوت:', err);
      throw err;
    }
  }, [loadSound]);

  // تشغيل سلسلة من الأصوات بالتتابع
  const playSequence = useCallback(async (urls: string[], delay: number = 300): Promise<void> => {
    if (!urls.length) return;

    try {
      // إيقاف أي صوت قيد التشغيل
      stopAllSounds();

      // تحميل جميع الأصوات مقدمًا
      for (const url of urls) {
        await loadSound(url);
      }

      // تشغيل الأصوات بالتتابع
      for (const url of urls) {
        if (!isPlayingRef.current) break; // التحقق إذا تم طلب إيقاف التشغيل
        await playSound(url);
        // وقفة قصيرة بين كل صوت
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      console.error('خطأ في تشغيل سلسلة الأصوات:', err);
    }
  }, [loadSound, playSound, stopAllSounds]);

  return {
    playSound,
    playSequence,
    loadSound,
    isLoaded,
    error,
    stopAllSounds
  };
}
