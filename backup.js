// backup.js
// نسخ احتياطي / استعادة (JSON) وتصدير بيانات الزبائن كملف CSV يُفتح في Excel

const Backup = {

  async exportAll() {
    const [customers, payments, reminders] = await Promise.all([
      DB.getAll(DB.STORE_CUSTOMERS),
      DB.getAll(DB.STORE_PAYMENTS),
      DB.getAll(DB.STORE_REMINDERS)
    ]);

    const settingsKeys = ["messageTemplate", "shopName", "autoReminder", "pinHash", "darkMode"];
    const settings = {};
    for (const key of settingsKeys) {
      const val = await DB.getSetting(key, null);
      if (val !== null) settings[key] = val;
    }

    const payload = {
      app: "مذكّر الديون",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { customers, payments, reminders, settings }
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `مذكر_الديون_نسخة_احتياطية_${Utils.todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async importFromFile(file) {
    const text = await file.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      throw new Error("ملف النسخة الاحتياطية غير صالح");
    }

    if (!payload || !payload.data) {
      throw new Error("تنسيق ملف غير معروف");
    }

    const { customers = [], payments = [], reminders = [], settings = {} } = payload.data;

    // مسح البيانات الحالية بالكامل قبل الاستعادة
    await DB.clear(DB.STORE_CUSTOMERS);
    await DB.clear(DB.STORE_PAYMENTS);
    await DB.clear(DB.STORE_REMINDERS);

    for (const c of customers) await DB.put(DB.STORE_CUSTOMERS, c);
    for (const p of payments) await DB.put(DB.STORE_PAYMENTS, p);
    for (const r of reminders) await DB.put(DB.STORE_REMINDERS, r);

    for (const key of Object.keys(settings)) {
      await DB.setSetting(key, settings[key]);
    }

    return {
      customersCount: customers.length,
      paymentsCount: payments.length,
      remindersCount: reminders.length
    };
  },

  // تصدير بيانات الزبائن كملف CSV (يفتح مباشرة في Excel، مع دعم كامل للأحرف العربية عبر BOM)
  async exportCSV() {
    const customers = await Customers.getAll();

    const headers = ["اسم الزبون", "رقم الهاتف", "إجمالي الدين", "المدفوع", "المتبقي", "تاريخ الاستحقاق", "الحالة"];
    const rows = [headers.join(",")];

    for (const c of customers) {
      const row = [
        Utils.csvEscape(c.name),
        Utils.csvEscape(Utils.displayPhone(c.phone)),
        Utils.csvEscape(c.totalAmount),
        Utils.csvEscape(c.paidAmount),
        Utils.csvEscape(c.remainingAmount),
        Utils.csvEscape(Utils.formatDateDisplay(c.dueDate)),
        Utils.csvEscape(c.status)
      ];
      rows.push(row.join(","));
    }

    const csvContent = "\uFEFF" + rows.join("\r\n"); // BOM لدعم العربية في Excel
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `مذكر_الديون_تقرير_${Utils.todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};
