/**
 * هذا الملف يتضمن وظائف لتحسين أداء تخزين واسترجاع البيانات باستخدام الكاش وتقنيات الكتابة غير المتزامنة
 */

import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

// نوع البيانات المخزنة
export interface StorageData {
  [key: string]: any;
}

// كاش للبيانات المحملة في الذاكرة
const memoryCache: Map<string, any> = new Map();

// قائمة الملفات التي تم تعديلها وتحتاج للكتابة
const pendingWrites: Set<string> = new Set();

// مؤقت الكتابة المجمعة
let writeTimer: NodeJS.Timeout | null = null;

// الوقت بين عمليات الكتابة المجمعة (بالمللي ثانية)
const WRITE_DEBOUNCE_TIME = 2000; // 2 ثوانية

// مجلد التخزين الافتراضي
const getStorageFolder = (): string => {
  return join(app.getPath('userData'), 'queue-data');
}

/**
 * التأكد من وجود مجلد التخزين
 */
export async function ensureStorageFolder(): Promise<void> {
  const folder = getStorageFolder();

  try {
    if (!existsSync(folder)) {
      await fs.mkdir(folder, { recursive: true });
      console.log(`تم إنشاء مجلد التخزين: ${folder}`);
    }
  } catch (error) {
    console.error('خطأ في إنشاء مجلد التخزين:', error);
    throw error;
  }
}

/**
 * قراءة البيانات من الملف وتخزينها في الكاش
 * @param filename اسم الملف
 * @param defaultValue القيمة الافتراضية إذا لم يكن الملف موجودًا
 */
export async function loadData<T>(filename: string, defaultValue: T): Promise<T> {
  const startTime = Date.now();

  // التحقق من وجود البيانات في الكاش
  if (memoryCache.has(filename)) {
    console.log(`تم تحميل ${filename} من الكاش (${Date.now() - startTime}ms)`);
    return memoryCache.get(filename) as T;
  }

  const filePath = join(getStorageFolder(), filename);

  try {
    // التحقق من وجود الملف
    if (!existsSync(filePath)) {
      console.log(`الملف ${filename} غير موجود، استخدام القيمة الافتراضية`);
      memoryCache.set(filename, defaultValue);
      return defaultValue;
    }

    // قراءة الملف
    const data = await fs.readFile(filePath, 'utf8');
    const parsedData = JSON.parse(data) as T;

    // تخزين البيانات في الكاش
    memoryCache.set(filename, parsedData);

    console.log(`تم تحميل ${filename} من القرص (${Date.now() - startTime}ms)`);
    return parsedData;
  } catch (error) {
    console.error(`خطأ في قراءة الملف ${filename}:`, error);

    // في حالة حدوث خطأ، استخدام القيمة الافتراضية
    memoryCache.set(filename, defaultValue);
    return defaultValue;
  }
}

/**
 * حفظ البيانات في الكاش وجدولة الكتابة للقرص
 * @param filename اسم الملف
 * @param data البيانات المراد حفظها
 */
export function saveData<T>(filename: string, data: T): void {
  // تحديث الكاش
  memoryCache.set(filename, data);

  // إضافة الملف لقائمة الانتظار للكتابة
  pendingWrites.add(filename);

  // بدء مؤقت الكتابة إذا لم يكن موجودًا
  if (!writeTimer) {
    writeTimer = setTimeout(flushPendingWrites, WRITE_DEBOUNCE_TIME);
  }
}

/**
 * كتابة جميع الملفات المعلقة للقرص
 */
export async function flushPendingWrites(): Promise<void> {
  // إلغاء المؤقت
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }

  // لا شيء للكتابة
  if (pendingWrites.size === 0) {
    return;
  }

  const startTime = Date.now();
  console.log(`بدء عملية كتابة ${pendingWrites.size} ملف(ات) معلقة...`);

  // نسخ قائمة الملفات المعلقة ثم تفريغها
  const filesToWrite = [...pendingWrites];
  pendingWrites.clear();

  // كتابة كل ملف
  const writePromises = filesToWrite.map(async (filename) => {
    try {
      const data = memoryCache.get(filename);
      if (data === undefined) {
        return;
      }

      const filePath = join(getStorageFolder(), filename);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error(`خطأ في كتابة الملف ${filename}:`, error);
      // إعادة الملف لقائمة الانتظار في حالة الفشل
      pendingWrites.add(filename);
    }
  });

  // انتظار اكتمال كل عمليات الكتابة
  await Promise.all(writePromises);

  console.log(`تم الانتهاء من كتابة الملفات (${Date.now() - startTime}ms)`);

  // إذا كانت هناك ملفات جديدة للكتابة، بدء مؤقت جديد
  if (pendingWrites.size > 0) {
    writeTimer = setTimeout(flushPendingWrites, WRITE_DEBOUNCE_TIME);
  }
}

/**
 * حذف جميع بيانات الكاش
 */
export function clearCache(): void {
  memoryCache.clear();
  console.log('تم مسح الكاش');
}

/**
 * حفظ كل البيانات المعلقة عند إغلاق التطبيق
 */
export async function saveAllPendingData(): Promise<void> {
  console.log('حفظ جميع البيانات المعلقة قبل الإغلاق...');
  await flushPendingWrites();
}

// تصدير الإعدادات للاستخدام في الملفات الأخرى
export const storageConfig = {
  writeDebounceTime: WRITE_DEBOUNCE_TIME,
  getFolder: getStorageFolder
};
