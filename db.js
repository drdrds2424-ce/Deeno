// db.js
// طبقة التعامل مع قاعدة بيانات IndexedDB
// تخزّن كل بيانات التطبيق محليًا على جهاز المستخدم فقط

const DB_NAME = "MudhakirDeyoonDB";
const DB_VERSION = 1;

const STORE_CUSTOMERS = "customers";
const STORE_PAYMENTS = "payments";
const STORE_REMINDERS = "reminders";
const STORE_SETTINGS = "settings";

let _dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_dbInstance) return resolve(_dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_CUSTOMERS)) {
        const customersStore = db.createObjectStore(STORE_CUSTOMERS, { keyPath: "id", autoIncrement: true });
        customersStore.createIndex("status", "status", { unique: false });
        customersStore.createIndex("name", "name", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_PAYMENTS)) {
        const paymentsStore = db.createObjectStore(STORE_PAYMENTS, { keyPath: "id", autoIncrement: true });
        paymentsStore.createIndex("customerId", "customerId", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_REMINDERS)) {
        const remindersStore = db.createObjectStore(STORE_REMINDERS, { keyPath: "id", autoIncrement: true });
        remindersStore.createIndex("customerId", "customerId", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
      }
    };

    request.onsuccess = (event) => {
      _dbInstance = event.target.result;
      resolve(_dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

function txStore(storeName, mode = "readonly") {
  return openDB().then((db) => {
    const tx = db.transaction(storeName, mode);
    return { tx, store: tx.objectStore(storeName) };
  });
}

// ---------- عمليات عامة ----------

function dbAdd(storeName, value) {
  return txStore(storeName, "readwrite").then(({ tx, store }) => {
    return new Promise((resolve, reject) => {
      const req = store.add(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

function dbPut(storeName, value) {
  return txStore(storeName, "readwrite").then(({ tx, store }) => {
    return new Promise((resolve, reject) => {
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

function dbGet(storeName, key) {
  return txStore(storeName, "readonly").then(({ store }) => {
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

function dbGetAll(storeName) {
  return txStore(storeName, "readonly").then(({ store }) => {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

function dbGetAllByIndex(storeName, indexName, value) {
  return txStore(storeName, "readonly").then(({ store }) => {
    return new Promise((resolve, reject) => {
      const idx = store.index(indexName);
      const req = idx.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

function dbDelete(storeName, key) {
  return txStore(storeName, "readwrite").then(({ store }) => {
    return new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

function dbClear(storeName) {
  return txStore(storeName, "readwrite").then(({ store }) => {
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

// ---------- الإعدادات (مخزن مفتاح/قيمة) ----------

function getSetting(key, defaultValue) {
  return dbGet(STORE_SETTINGS, key).then((row) => {
    return row ? row.value : defaultValue;
  });
}

function setSetting(key, value) {
  return dbPut(STORE_SETTINGS, { key, value });
}

// كائن DB يجمع كل الوظائف لتسهيل الاستخدام في باقي الملفات
const DB = {
  STORE_CUSTOMERS,
  STORE_PAYMENTS,
  STORE_REMINDERS,
  STORE_SETTINGS,
  open: openDB,
  add: dbAdd,
  put: dbPut,
  get: dbGet,
  getAll: dbGetAll,
  getAllByIndex: dbGetAllByIndex,
  delete: dbDelete,
  clear: dbClear,
  getSetting,
  setSetting
};
