// debts.js
// إدارة الديون: إضافة دين لزبون، حساب الإحصائيات، عرض صفحة الديون

const Debts = {

  // إضافة/زيادة دين على زبون موجود
  async addDebt(customerId, amount, dueDate, notes) {
    customerId = Number(customerId);
    const customer = await Customers.get(customerId);
    if (!customer) throw new Error("الزبون غير موجود");

    amount = Number(amount) || 0;
    const newTotal = (Number(customer.totalAmount) || 0) + amount;
    const newRemaining = (Number(customer.remainingAmount) || 0) + amount;

    const updated = {
      ...customer,
      totalAmount: newTotal,
      remainingAmount: newRemaining,
      dueDate: dueDate || customer.dueDate,
      notes: notes ? ((customer.notes ? customer.notes + " | " : "") + notes.trim()) : customer.notes
    };
    updated.status = Utils.computeStatus(updated);
    await DB.put(DB.STORE_CUSTOMERS, updated);
    return updated;
  },

  // حساب إحصائيات لوحة التحكم والتقارير من قائمة الزبائن
  async computeStats() {
    const all = await Customers.getAll();
    const reminders = await DB.getAll(DB.STORE_REMINDERS);

    let totalDebt = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let debtorsCount = 0;
    let dueToday = 0;
    let overdue = 0;
    let dueWeek = 0;
    let dueMonth = 0;

    for (const c of all) {
      totalDebt += Number(c.totalAmount) || 0;
      totalPaid += Number(c.paidAmount) || 0;
      totalRemaining += Number(c.remainingAmount) || 0;

      if ((Number(c.remainingAmount) || 0) > 0) {
        debtorsCount++;
        if (c.dueDate) {
          const diff = Utils.daysDiff(c.dueDate);
          if (diff < 0) overdue++;
          else if (diff === 0) dueToday++;
          if (diff >= 0 && diff <= 7) dueWeek++;
          if (diff >= 0 && diff <= 30) dueMonth++;
        }
      }
    }

    return {
      totalDebt,
      totalPaid,
      totalRemaining,
      debtorsCount,
      dueToday,
      overdue,
      dueWeek,
      dueMonth,
      remindersSent: reminders.length
    };
  },

  // أكثر الزبائن تأخرًا (الأكثر تجاوزًا لتاريخ الاستحقاق، من ضمن من لديهم مبلغ متبقٍ)
  async getTopOverdue(limit = 5) {
    const all = await Customers.getAll();
    const overdue = all.filter((c) => c.remainingAmount > 0 && c.dueDate && Utils.daysDiff(c.dueDate) < 0);
    overdue.sort((a, b) => Utils.daysDiff(a.dueDate) - Utils.daysDiff(b.dueDate));
    return overdue.slice(0, limit);
  },

  // أكثر الزبائن مديونية (حسب المبلغ المتبقي)
  async getTopDebtors(limit = 5) {
    const all = await Customers.getAll();
    const debtors = all.filter((c) => c.remainingAmount > 0);
    debtors.sort((a, b) => b.remainingAmount - a.remainingAmount);
    return debtors.slice(0, limit);
  },

  filterAndSort(list, { statusFilter, sortBy }) {
    let result = [...list];

    if (statusFilter === "active") {
      result = result.filter((c) => c.remainingAmount > 0);
    } else if (statusFilter && statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }

    if (sortBy === "amount") {
      result.sort((a, b) => (b.remainingAmount || 0) - (a.remainingAmount || 0));
    } else {
      result.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    }
    return result;
  },

  renderOverdueMiniCard(customer) {
    const diff = Utils.daysDiff(customer.dueDate);
    const daysLate = Math.abs(diff);
    return `
    <div class="card-item" data-id="${customer.id}" data-action="view">
      <div class="card-item-top">
        <span class="card-item-name">${Utils.escapeHtml(customer.name)}</span>
        <span class="badge status-متأخر">متأخر ${daysLate} يوم</span>
      </div>
      <div class="card-item-bottom">
        <span>${Utils.displayPhone(customer.phone)}</span>
        <span class="card-item-remaining">${Utils.formatMoney(customer.remainingAmount)}</span>
      </div>
    </div>`;
  }
};
