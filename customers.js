// customers.js
// إدارة بيانات الزبائن: إضافة، تعديل، حذف، بحث، فلترة، وعرض القوائم والتفاصيل

const Customers = {

  // إضافة زبون جديد (بدون دين مبدئي)
  async add({ name, phone, governorate, notes }) {
    const now = new Date().toISOString();
    const customer = {
      name: name.trim(),
      phone,
      governorate: (governorate || "").trim(),
      notes: (notes || "").trim(),
      totalAmount: 0,
      paidAmount: 0,
      remainingAmount: 0,
      dueDate: null,
      lastPaymentDate: null,
      status: "مسدد",
      createdAt: now
    };
    const id = await DB.add(DB.STORE_CUSTOMERS, customer);
    return id;
  },

  async getAll() {
    return DB.getAll(DB.STORE_CUSTOMERS);
  },

  async get(id) {
    return DB.get(DB.STORE_CUSTOMERS, Number(id));
  },

  async update(id, patch) {
    const customer = await this.get(id);
    if (!customer) throw new Error("الزبون غير موجود");
    const updated = { ...customer, ...patch };
    updated.status = Utils.computeStatus(updated);
    await DB.put(DB.STORE_CUSTOMERS, updated);
    return updated;
  },

  async delete(id) {
    id = Number(id);
    await DB.delete(DB.STORE_CUSTOMERS, id);
    // حذف الدفعات والتذكيرات المرتبطة بالزبون
    const payments = await DB.getAllByIndex(DB.STORE_PAYMENTS, "customerId", id);
    for (const p of payments) await DB.delete(DB.STORE_PAYMENTS, p.id);
    const reminders = await DB.getAllByIndex(DB.STORE_REMINDERS, "customerId", id);
    for (const r of reminders) await DB.delete(DB.STORE_REMINDERS, r.id);
  },

  // تسجيل دفعة جديدة لزبون
  async recordPayment(customerId, amount, notes) {
    customerId = Number(customerId);
    const customer = await this.get(customerId);
    if (!customer) throw new Error("الزبون غير موجود");

    amount = Number(amount) || 0;
    const today = Utils.todayISO();

    const payment = {
      customerId,
      amount,
      notes: (notes || "").trim(),
      date: today,
      createdAt: new Date().toISOString()
    };
    await DB.add(DB.STORE_PAYMENTS, payment);

    const newPaid = (Number(customer.paidAmount) || 0) + amount;
    let newRemaining = (Number(customer.totalAmount) || 0) - newPaid;
    if (newRemaining < 0) newRemaining = 0;

    const updated = {
      ...customer,
      paidAmount: newPaid,
      remainingAmount: newRemaining,
      lastPaymentDate: today
    };
    updated.status = Utils.computeStatus(updated);
    await DB.put(DB.STORE_CUSTOMERS, updated);
    return updated;
  },

  async getPayments(customerId) {
    const payments = await DB.getAllByIndex(DB.STORE_PAYMENTS, "customerId", Number(customerId));
    return payments.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  },

  // إعادة حساب حالة كل الزبائن (يُستخدم عند فتح التطبيق لتحديث "متأخر" حسب تاريخ اليوم)
  async refreshAllStatuses() {
    const all = await this.getAll();
    for (const c of all) {
      const newStatus = Utils.computeStatus(c);
      if (newStatus !== c.status) {
        c.status = newStatus;
        await DB.put(DB.STORE_CUSTOMERS, c);
      }
    }
    return all;
  },

  // فلترة وترتيب قائمة الزبائن
  filterAndSort(list, { search, statusFilter, sortBy }) {
    let result = [...list];

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        Utils.displayPhone(c.phone).includes(q) ||
        c.phone.includes(q)
      );
    }

    if (statusFilter && statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }

    if (sortBy === "amount") {
      result.sort((a, b) => (b.remainingAmount || 0) - (a.remainingAmount || 0));
    } else if (sortBy === "dueDate") {
      result.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    } else {
      result.sort((a, b) => a.name.localeCompare(b.name, "ar"));
    }

    return result;
  },

  // ---------- عناصر واجهة (HTML) ----------

  renderCard(customer) {
    const remainingClass = customer.remainingAmount > 0 ? "" : "";
    return `
    <div class="card-item" data-id="${customer.id}">
      <div class="card-item-top">
        <span class="card-item-name">${Utils.escapeHtml(customer.name)}</span>
        <span class="badge status-${customer.status}">${customer.status}</span>
      </div>
      <span class="card-item-phone">${Utils.displayPhone(customer.phone)}</span>
      <div class="card-item-bottom">
        <span>استحقاق: ${Utils.formatDateDisplay(customer.dueDate)}</span>
        <span class="card-item-remaining">${Utils.formatMoney(customer.remainingAmount)}</span>
      </div>
      <div class="card-actions">
        <button class="btn-view-mini" data-action="view" data-id="${customer.id}">عرض التفاصيل</button>
        ${customer.remainingAmount > 0 ? `<button class="btn-whatsapp-mini" data-action="whatsapp" data-id="${customer.id}">📱 واتساب</button>` : ""}
      </div>
    </div>`;
  },

  renderList(container, list) {
    if (!list.length) {
      container.innerHTML = `<div class="empty-state">لا يوجد زبائن لعرضهم</div>`;
      return;
    }
    container.innerHTML = list.map((c) => this.renderCard(c)).join("");
  },

  renderDetail(customer) {
    return `
      <div class="card-item-top" style="margin-bottom:10px;">
        <span class="name">${Utils.escapeHtml(customer.name)}</span>
        <span class="badge status-${customer.status}">${customer.status}</span>
      </div>
      <span class="phone">${Utils.displayPhone(customer.phone)}</span>
      ${customer.governorate ? `<div class="hint" style="margin:4px 0;">📍 ${Utils.escapeHtml(customer.governorate)}</div>` : ""}
      ${customer.notes ? `<div class="hint" style="margin:4px 0;">📝 ${Utils.escapeHtml(customer.notes)}</div>` : ""}
      <div class="detail-grid">
        <div class="dg-item"><span class="dg-label">إجمالي الدين</span><span class="dg-value">${Utils.formatMoney(customer.totalAmount)}</span></div>
        <div class="dg-item"><span class="dg-label">المدفوع</span><span class="dg-value">${Utils.formatMoney(customer.paidAmount)}</span></div>
        <div class="dg-item"><span class="dg-label">المتبقي</span><span class="dg-value">${Utils.formatMoney(customer.remainingAmount)}</span></div>
        <div class="dg-item"><span class="dg-label">تاريخ الاستحقاق</span><span class="dg-value">${Utils.formatDateDisplay(customer.dueDate)}</span></div>
        <div class="dg-item"><span class="dg-label">آخر دفعة</span><span class="dg-value">${Utils.formatDateDisplay(customer.lastPaymentDate)}</span></div>
      </div>
    `;
  },

  renderPaymentsHistory(payments) {
    if (!payments.length) {
      return `<div class="empty-state">لا توجد دفعات مسجلة بعد</div>`;
    }
    return payments.map((p) => `
      <div class="card-item">
        <div class="card-item-top">
          <span class="card-item-name">${Utils.formatMoney(p.amount)}</span>
          <span class="card-item-phone">${Utils.formatDateDisplay(p.date)}</span>
        </div>
        ${p.notes ? `<span class="hint" style="margin:0;">${Utils.escapeHtml(p.notes)}</span>` : ""}
      </div>
    `).join("");
  }
};
