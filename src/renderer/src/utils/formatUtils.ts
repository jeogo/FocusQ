/**
 * ملف مساعد للتنسيق يضمن استخدام الأرقام والتواريخ بصيغة en-US في جميع التطبيق
 */

// تنسيق التاريخ بصيغة إنجليزية
export function formatDate(date: Date | string, includeTime = true): string {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };
  
  if (includeTime) {
    options.hour = 'numeric';
    options.minute = 'numeric';
    options.hour12 = true;
  }
  
  return dateObj.toLocaleString('en-US', options);
}

// تنسيق الوقت فقط بصيغة إنجليزية
export function formatTime(date: Date | string): string {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  });
}

// تنسيق الأرقام بصيغة إنجليزية
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

// تنسيق المدة الزمنية بالدقائق
export function formatDuration(minutes: number): string {
  return minutes.toLocaleString('en-US', { 
    minimumFractionDigits: 1, 
    maximumFractionDigits: 1 
  }) + ' min';
}

// تنسيق وقت الانتظار المقدر
export function formatEstimatedWaitTime(minutes: number): string {
  return minutes.toLocaleString('en-US') + ' min approx.';
}

// الحصول على تاريخ اليوم بصيغة ISO
export function getTodayString(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

// تنسيق وقت منقضي (لعرض الوقت المستغرق للخدمة)
export function formatElapsedTime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Default export لسهولة الاستيراد
export default {
  formatDate: formatDate,
  formatTime: formatTime,
  formatNumber: formatNumber,
  formatDuration: formatDuration,
  formatEstimatedWaitTime: formatEstimatedWaitTime,
  getTodayString: getTodayString,
  formatElapsedTime: formatElapsedTime
};
