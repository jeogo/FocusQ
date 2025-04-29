/**
 * Audio utility functions for the application
 */

// Import notification sound only - we'll handle other sounds differently
import notificationSoundPath from '@assets/sounds/notification.mp3';

// Cache for preloaded audio resources

// Initialize notification sound
export const createNotificationSound = (): HTMLAudioElement => {
  let audio: HTMLAudioElement;

  // Check if we're in Electron environment
  if (window.api?.resources) {
    // In Electron, use our resources API to get the resource path
    const audioEl = new Audio();

    // First try loading the file directly through Vite's import
    audioEl.src = notificationSoundPath;

    // As a backup, we can also try the IPC approach
    window.api.resources.getResourcePath('assets/sounds/notification.mp3')
      .then(path => {
        // Only update if the current src didn't load
        if (audioEl.error) {
          audioEl.src = path;
          audioEl.load();
        }
      })
      .catch(() => {
        console.debug('Using imported sound file instead of IPC path');
      });

    audio = audioEl;
  } else {
    // In development web mode, use the imported path directly
    audio = new Audio(notificationSoundPath);
  }

  // Preload the audio
  audio.load();

  return audio;
};

// Play notification with proper error handling
export const playNotificationSound = (audioElement: HTMLAudioElement | null): void => {
  if (!audioElement) return;

  // Reset to beginning
  audioElement.currentTime = 0;

  // Play with error handling
  audioElement.play().catch(error => {
    // Only log real errors, not user interaction errors
    if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
      console.debug('Sound playback issue:', error.name);
    }
  });
};

// Create an audio context for more advanced audio features
export const createAudioContext = (): AudioContext | null => {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch (error) {
    console.warn('AudioContext not supported in this browser');
    return null;
  }
};

// Speak text using the Web Speech API (useful for announcements)
export const speakText = (text: string, lang: string = 'ar-SA'): void => {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9; // Slightly slower than normal
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  } else {
    console.warn('Speech synthesis not supported in this browser');
  }
};

/**
 * Helper function to get the correct path for voice files
 * Returns a path suitable for <audio src="...">
 */
const getVoiceFilePath = async (fileName: string): Promise<string> => {
  if (window.api?.resources) {
    try {
      // Try all possible paths in order
      const possiblePaths = [
        `assets/sounds/voice/${fileName}`,
        `resources/assets/sounds/voice/${fileName}`
      ];
      for (const relPath of possiblePaths) {
        const absPath = await window.api.resources.getResourcePath(relPath);
        if (absPath) {
          // If it's an absolute path, convert to file:// URL for Electron
          if (/^\/|^[A-Za-z]:\\/.test(absPath)) {
            // Windows or Unix absolute path
            const fileUrl = `file://${absPath.replace(/\\/g, '/')}`;
            return fileUrl;
          }
          // If it's already a URL or relative path, just return it
          return absPath;
        }
      }
      // Fallback to dev server path
      return `/assets/sounds/voice/${fileName}`;
    } catch (error) {
      console.error(`[Audio] Error resolving path for ${fileName}:`, error);
      return `/assets/sounds/voice/${fileName}`;
    }
  }
  // In browser/dev mode, use relative path
  return `/assets/sounds/voice/${fileName}`;
};

/**
 * Create and preload an audio element with better error handling.
 * Uses only web-accessible URLs (never file://) for <audio src>.
 * Falls back to /assets/sounds/notification.mp3 for notification.mp3.
 */
const createAudioElement = async (fileName: string): Promise<HTMLAudioElement> => {
  const audio = new Audio();
  try {
    // Always use a web path for <audio src>
    // Special fallback for notification.mp3
    let src = `/assets/sounds/voice/${fileName}`;
    if (fileName === 'notification.mp3') {
      // Try /assets/sounds/voice/notification.mp3 first, then fallback to /assets/sounds/notification.mp3
      audio.src = src;
      // Try to load, but if error, fallback
      try {
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            audio.removeEventListener('canplaythrough', onReady);
            audio.removeEventListener('error', onError);
          };
          const onReady = () => {
            cleanup();
            resolve();
          };
          const onError = (e: Event) => {
            cleanup();
            reject(e);
          };
          audio.addEventListener('canplaythrough', onReady, { once: true });
          audio.addEventListener('error', onError, { once: true });
          audio.load();
          setTimeout(() => {
            cleanup();
            if (audio.readyState >= 2) resolve();
            else reject(new Error(`Timeout loading audio file: ${src}`));
          }, 1500);
        });
        return audio;
      } catch {
        // Fallback to /assets/sounds/notification.mp3 (root assets)
        src = `/assets/sounds/notification.mp3`;
        audio.src = src;
      }
    } else {
      audio.src = src;
    }

    // Preload and resolve when ready or error
    return await new Promise((resolve, reject) => {
      const cleanup = () => {
        audio.removeEventListener('canplaythrough', onReady);
        audio.removeEventListener('error', onError);
      };
      const onReady = () => {
        cleanup();
        resolve(audio);
      };
      const onError = (e: Event) => {
        cleanup();
        reject(e);
      };
      audio.addEventListener('canplaythrough', onReady, { once: true });
      audio.addEventListener('error', onError, { once: true });
      audio.load();
      setTimeout(() => {
        cleanup();
        if (audio.readyState >= 2) {
          resolve(audio);
        } else {
          reject(new Error(`Timeout loading audio file: ${src}`));
        }
      }, 3000);
    });
  } catch (error) {
    console.error(`[Audio] Failed to load audio file ${fileName}:`, error);
    throw error;
  }
};

/**
 * Play ticket announcement using audio files with better timing control
 */
export const playTicketAnnouncement = async (ticketNumber: number, counterNumber: number): Promise<void> => {
  try {
    const safeTicketNumber = Math.min(Math.max(1, ticketNumber), 500);
    const safeCounterNumber = Math.min(Math.max(1, Math.floor(counterNumber)), 10);

    console.log(`[Audio] Start announcement for ticket ${safeTicketNumber} to counter ${safeCounterNumber}`);

    // Play notification.mp3 first with logging
    try {
      const notificationAudio = await createAudioElement('notification.mp3');
      console.log(`[Audio] Playing notification sound...`);
      await playSingleVoiceFile(notificationAudio);
    } catch (error) {
      console.warn('[Audio] Failed to play notification.mp3:', error);
    }

    // Sequence of audio files to play after notification with logging
    const sequence = [
      `ticket.mp3`,
      `number_${safeTicketNumber}.mp3`,
      `please_go_to.mp3`,
      `counter_${safeCounterNumber}.mp3`
    ];

    console.log(`[Audio] Starting voice sequence for ticket ${safeTicketNumber}`);

    for (const fileName of sequence) {
      try {
        console.log(`[Audio] Playing ${fileName}...`);
        const audio = await createAudioElement(fileName);
        await playSingleVoiceFile(audio);
      } catch (error) {
        console.warn(`[Audio] Failed to play ${fileName}:`, error);
        break;
      }
    }

    console.log(`[Audio] Completed announcement for ticket ${safeTicketNumber}`);
  } catch (error) {
    console.warn('[Audio] Announcement failed:', error);
  }
};

/**
 * Play a single voice file and wait for it to complete
 */
const playSingleVoiceFile = (audio: HTMLAudioElement): Promise<void> => {
  return new Promise((resolve, reject) => {
    // الاستماع لحدث انتهاء التشغيل
    const onEnded = () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      resolve();
    };

    // الاستماع لحدث خطأ
    const onError = (error: Event) => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      reject(error);
    };

    // إضافة المستمعين
    audio.addEventListener('ended', onEnded, { once: true });
    audio.addEventListener('error', onError, { once: true });

    // بدء تشغيل الصوت
    const playPromise = audio.play();

    // معالجة خطأ autoplay المحتمل
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        // فقط log الأخطاء الحقيقية، وليس أخطاء التفاعل مع المستخدم
        if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
          console.debug('Sound playback issue:', error.name);
        }
        reject(error);
      });
    }
  });
};

// Check if an audio file exists
const checkAudioFile = async (fileName: string): Promise<boolean> => {
  if (window.api?.resources) {
    // Remove leading slash if present
    const cleanPath = fileName.replace(/^\//, '');
    try {
      const filePath = await window.api.resources.getResourcePath(cleanPath);
      const exists = !!filePath;
      console.log(`[Audio] ${cleanPath} exists: ${exists}`);
      return exists;
    } catch (error) {
      console.error(`[Audio] Error checking if file exists: ${cleanPath}`, error);
      return false;
    }
  } else {
    // In browser mode, use fetch
    try {
      const response = await fetch(fileName);
      return response.ok;
    } catch (error) {
      console.error(`[Audio] Fetch error for ${fileName}:`, error);
      return false;
    }
  }
};

