/**
 * Audio utility functions for the application
 */

// Import the notification sound directly so Vite can properly handle it
import notificationSoundPath from '../../../../resources/assets/sounds/notification.mp3';

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
