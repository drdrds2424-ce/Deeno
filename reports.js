// reports.js
// حساب وعرض بيانات صفحة التقارير

const Reports = {
  async build() {
    const stats = await Debts.computeStats();
    const topDebtors = await Debts.getTopDebtors(8);
    return { stats, topDebtors };
  },

  renderDebtorRow(customer) {
    return `
    <div class="card-item" data-id="${customer.id}" data-action="view">
      <div class="card-item-top">
        <span class="card-item-name">${Utils.escapeHtml(customer.name)}</span>
        <span class="badge status-${customer.status}">${customer.status}</span>
      </div>
      <div class="card-item-bottom">
        <span>${Utils.displayPhone(customer.phone)}</span>
        <span class="card-item-remaining">${Utils.formatMoney(customer.remainingAmount)}</span>
      </div>
    </div>`;
  }
};
