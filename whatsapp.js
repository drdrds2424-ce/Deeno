// whatsapp.js
// توليد رسائل التذكير وروابط واتساب الرسمية (wa.me) وتسجيل سجل التذكيرات

const DEFAULT_TEMPLATE =
`السلام عليكم {name}
نذكركم بأن المبلغ المتبقي بذمتكم هو {remaining} دينار عراقي.
تاريخ الاستحقاق: {dueDate}

نرجو تسديد المبلغ عند الإمكان.
وشكرًا لتعاونكم.`;

const WhatsApp = {

  async getTemplate() {
    return DB.getSetting("messageTemplate", DEFAULT_TEMPLATE);
  },

  async setTemplate(text) {
    return DB.setSetting("messageTemplate", text);
  },

  async getShopName() {
    return DB.getSetting("shopName", "");
  },

  async setShopName(name) {
    return DB.setSetting("shopName", name);
  },

  // توليد نص الرسالة النهائي بعد استبدال المتغيرات
  buildMessage(template, customer, shopName) {
    return template
      .replaceAll("{name}", customer.name || "")
      .replaceAll("{remaining}", Utils.formatNumber(customer.remainingAmount))
      .replaceAll("{total}", Utils.formatNumber(customer.totalAmount))
      .replaceAll("{paid}", Utils.formatNumber(customer.paidAmount))
      .replaceAll("{dueDate}", Utils.formatDateDisplay(customer.dueDate))
      .replaceAll("{shopName}", shopName || "");
  },

  async buildMessageForCustomer(customer) {
    const template = await this.getTemplate();
    const shopName = await this.getShopName();
    return this.buildMessage(template, customer, shopName);
  },

  // بناء رابط واتساب الرسمي wa.me مع ترميز الرسالة
  buildWaLink(phoneIntl, message) {
    const encoded = encodeURIComponent(message);
    return `https://wa.me/${phoneIntl}?text=${encoded}`;
  },

  // فتح محادثة واتساب لزبون وتسجيل العملية في سجل التذكيرات
  async sendToCustomer(customer) {
    const message = await this.buildMessageForCustomer(customer);
    const link = this.buildWaLink(customer.phone, message);

    const win = window.open(link, "_blank");

    const status = win ? "تم فتح واتساب" : "لم يتم الإرسال";

    await DB.add(DB.STORE_REMINDERS, {
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      amount: customer.remainingAmount,
      status,
      createdAt: new Date().toISOString()
    });

    return status;
  },

  async getLog() {
    const log = await DB.getAll(DB.STORE_REMINDERS);
    return log.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  },

  // ---------- إعدادات التذكير التلقائي ----------

  async getAutoSettings() {
    return DB.getSetting("autoReminder", { enabled: false, daysBefore: 1, daysAfter: 3 });
  },

  async setAutoSettings(settings) {
    return DB.setSetting("autoReminder", settings);
  },

  // إيجاد الزبائن الذين يجب تذكيرهم اليوم حسب إعدادات التذكير التلقائي
  async getCustomersDueForReminder() {
    const settings = await this.getAutoSettings();
    if (!settings.enabled) return [];

    const all = await Customers.getAll();
    return all.filter((c) => {
      if (!(c.remainingAmount > 0) || !c.dueDate) return false;
      const diff = Utils.daysDiff(c.dueDate); // موجب = قبل الاستحقاق، سالب = بعد الاستحقاق (متأخر)
      if (diff > 0 && diff === Number(settings.daysBefore)) return true;
      if (diff < 0 && Math.abs(diff) === Number(settings.daysAfter)) return true;
      if (diff === 0) return true; // مستحق اليوم دائمًا يُنبَّه عنه
      return false;
    });
  },

  // ---------- عناصر واجهة ----------

  renderBulkItem(customer) {
    const diff = customer.dueDate ? Utils.daysDiff(customer.dueDate) : null;
    let meta;
    if (diff === null) meta = "بدون تاريخ استحقاق";
    else if (diff < 0) meta = `متأخر ${Math.abs(diff)} يوم`;
    else if (diff === 0) meta = "مستحق اليوم";
    else meta = `يستحق خلال ${diff} يوم`;

    return `
    <label class="bulk-item">
      <input type="checkbox" class="bulk-checkbox" value="${customer.id}">
      <div class="bulk-info">
        <div class="bulk-name">${Utils.escapeHtml(customer.name)} — ${Utils.formatMoney(customer.remainingAmount)}</div>
        <div class="bulk-meta">${meta}</div>
      </div>
    </label>`;
  },

  renderLogItem(entry) {
    const statusClass = entry.status === "تم فتح واتساب" ? "مسدد" : (entry.status === "لم يتم الإرسال" ? "متأخر" : "مستحق");
    return `
    <div class="card-item">
      <div class="card-item-top">
        <span class="card-item-name">${Utils.escapeHtml(entry.customerName)}</span>
        <span class="badge status-${statusClass}">${entry.status}</span>
      </div>
      <div class="card-item-bottom">
        <span>${Utils.displayPhone(entry.phone)}</span>
        <span class="card-item-remaining">${Utils.formatMoney(entry.amount)}</span>
      </div>
      <span class="hint" style="margin:0;">${Utils.formatDateTimeDisplay(entry.createdAt)}</span>
    </div>`;
  }
};
