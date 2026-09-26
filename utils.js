// utils.js
// دوال مساعدة مشتركة تستخدم في كل أنحاء التطبيق

const Utils = {

  // تنسيق رقم بفواصل الآلاف (150000 -> "150,000")
  formatNumber(n) {
    const num = Number(n) || 0;
    return num.toLocaleString("en-US");
  },

  // تنسيق مبلغ بالدينار العراقي (150000 -> "150,000 د.ع")
  formatMoney(n) {
    return `${this.formatNumber(n)} د.ع`;
  },

  // تاريخ اليوم بصيغة YYYY-MM-DD
  todayISO() {
    const d = new Date();
    return this.dateToISO(d);
  },

  dateToISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },

  // إضافة عدد أيام لتاريخ ISO وإرجاع تاريخ ISO جديد
  addDaysISO(isoDate, days) {
    const d = new Date(isoDate + "T00:00:00");
    d.setDate(d.getDate() + Number(days));
    return this.dateToISO(d);
  },

  // فرق الأيام بين تاريخين ISO (target - today)
  daysDiff(isoDate) {
    const today = new Date(this.todayISO() + "T00:00:00");
    const target = new Date(isoDate + "T00:00:00");
    const diffMs = target.getTime() - today.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  },

  // تنسيق تاريخ للعرض بالعربية (مبسّط: يوم/شهر/سنة)
  formatDateDisplay(isoDate) {
    if (!isoDate) return "—";
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
  },

  formatDateTimeDisplay(isoDateTime) {
    if (!isoDateTime) return "—";
    const d = new Date(isoDateTime);
    const datePart = this.formatDateDisplay(this.dateToISO(d));
    const h = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${datePart} - ${h}:${mi}`;
  },

  // تحقق من رقم الهاتف العراقي وتحويله للصيغة الدولية
  // يقبل: 07701234567 أو 9647701234567 أو +9647701234567 أو بمسافات/شرطات
  normalizeIraqiPhone(raw) {
    if (!raw) return { valid: false, formatted: null };
    let digits = String(raw).replace(/[^\d]/g, "");

    // إذا بدأ بـ 00964 احذف الصفرين الزائدين
    if (digits.startsWith("00964")) digits = digits.slice(2);

    // حالة: يبدأ بـ 964 بالفعل (13 رقم: 964 + 10 أرقام)
    if (digits.startsWith("964") && digits.length === 13) {
      const local = "0" + digits.slice(3);
      if (/^07\d{9}$/.test(local)) {
        return { valid: true, formatted: digits };
      }
      return { valid: false, formatted: null };
    }

    // حالة: رقم محلي يبدأ بـ 07 وطوله 11 رقم
    if (/^07\d{9}$/.test(digits)) {
      return { valid: true, formatted: "964" + digits.slice(1) };
    }

    return { valid: false, formatted: null };
  },

  // عرض رقم الهاتف بصيغة محلية مقروءة من الصيغة الدولية
  displayPhone(intlPhone) {
    if (!intlPhone) return "—";
    if (intlPhone.startsWith("964")) {
      return "0" + intlPhone.slice(3);
    }
    return intlPhone;
  },

  // حساب حالة الدين بناءً على المتبقي وتاريخ الاستحقاق
  computeStatus(customer) {
    const remaining = Number(customer.remainingAmount) || 0;
    if (remaining <= 0) return "مسدد";
    if (customer.dueDate && this.daysDiff(customer.dueDate) < 0) return "متأخر";
    return "مستحق";
  },

  escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  showToast(message, duration = 2600) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.add("hidden");
    }, duration);
  },

  // تحويل نص لأحرف CSV آمنة (يحيط بالقيمة بعلامات اقتباس ويهرب منها)
  csvEscape(value) {
    const str = String(value === null || value === undefined ? "" : value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }
};
