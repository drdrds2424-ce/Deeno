// app.js
// نقطة الدخول الرئيسية: التنقل بين الصفحات، لوحة التحكم، النوافذ المنبثقة،
// قفل PIN، الوضع الليلي، وتثبيت التطبيق (PWA)

const App = {
  currentPage: "dashboard",
  previousPage: "dashboard",
  selectedCustomerId: null,
  deferredInstallPrompt: null,
  activeReminderTab: "bulk",
  pinBuffer: "",

  async init() {
    this.registerServiceWorker();
    await DB.open();
    await this.applyTheme();
    await this.checkLock();
    this.bindGlobalEvents();
    await Customers.refreshAllStatuses();
    await this.checkDueBanner();
    this.showPage("dashboard");
    await this.renderDashboard();
    this.bindInstallPrompt();
  },

  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js").catch(() => {
          // فشل التسجيل (قد يحدث عند التشغيل من ملف محلي) - نتجاهل بصمت
        });
      });
    }
  },

  // ==================== القفل بـ PIN ====================

  async sha256Hex(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  },

  async checkLock() {
    const pinHash = await DB.getSetting("pinHash", null);
    if (!pinHash) {
      document.getElementById("appRoot").classList.remove("hidden");
      return;
    }
    document.getElementById("lockScreen").classList.remove("hidden");
    document.getElementById("appRoot").classList.add("hidden");
    this.setupPinPad(pinHash);
  },

  setupPinPad(pinHash) {
    this.pinBuffer = "";
    const dots = document.querySelectorAll("#pinDots span");
    const errorEl = document.getElementById("pinError");
    errorEl.classList.add("hidden");
    dots.forEach((d) => d.classList.remove("filled"));

    const keys = document.querySelectorAll(".pin-key");
    keys.forEach((key) => {
      key.onclick = async () => {
        const val = key.dataset.key;
        if (val === "clear") {
          this.pinBuffer = "";
        } else if (val === "back") {
          this.pinBuffer = this.pinBuffer.slice(0, -1);
        } else if (this.pinBuffer.length < 4) {
          this.pinBuffer += val;
        }

        dots.forEach((d, i) => d.classList.toggle("filled", i < this.pinBuffer.length));

        if (this.pinBuffer.length === 4) {
          const hash = await this.sha256Hex(this.pinBuffer);
          if (hash === pinHash) {
            errorEl.classList.add("hidden");
            document.getElementById("lockScreen").classList.add("hidden");
            document.getElementById("appRoot").classList.remove("hidden");
          } else {
            errorEl.classList.remove("hidden");
            this.pinBuffer = "";
            setTimeout(() => dots.forEach((d) => d.classList.remove("filled")), 200);
          }
        }
      };
    });
  },

  // ==================== الوضع الليلي ====================

  async applyTheme() {
    const dark = await DB.getSetting("darkMode", window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    const themeBtn = document.getElementById("btnTheme");
    if (themeBtn) themeBtn.textContent = dark ? "☀️" : "🌙";
    const settingsToggle = document.getElementById("settingsDarkMode");
    if (settingsToggle) settingsToggle.checked = !!dark;
  },

  async toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") === "dark";
    const next = !current;
    await DB.setSetting("darkMode", next);
    await this.applyTheme();
  },

  // ==================== التنقل بين الصفحات ====================

  showPage(pageName, opts = {}) {
    document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
    const target = document.getElementById(`page-${pageName}`);
    if (target) target.classList.remove("hidden");

    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.page === pageName);
    });

    const titles = {
      dashboard: "مذكّر الديون",
      customers: "الزبائن",
      "customer-detail": "تفاصيل الزبون",
      debts: "الديون",
      reminders: "التذكيرات",
      reports: "التقارير",
      settings: "الإعدادات"
    };
    document.getElementById("pageTitle").textContent = titles[pageName] || "مذكّر الديون";

    const backBtn = document.getElementById("btnBack");
    const showBack = pageName === "customer-detail";
    backBtn.classList.toggle("hidden", !showBack);

    const bottomNav = document.querySelector(".bottom-nav");
    bottomNav.style.display = ["dashboard", "customers", "debts", "reminders", "reports", "settings"].includes(pageName) ? "flex" : "none";

    if (!opts.keepPrevious) {
      this.previousPage = this.currentPage;
    }
    this.currentPage = pageName;
    document.getElementById("mainContent").scrollTop = 0;
  },

  async navigateTo(pageName) {
    this.showPage(pageName);
    if (pageName === "dashboard") await this.renderDashboard();
    else if (pageName === "customers") await this.renderCustomersPage();
    else if (pageName === "debts") await this.renderDebtsPage();
    else if (pageName === "reminders") await this.renderRemindersPage();
    else if (pageName === "reports") await this.renderReportsPage();
    else if (pageName === "settings") await this.renderSettingsPage();
  },

  async openCustomerDetail(id) {
    this.selectedCustomerId = Number(id);
    this.showPage("customer-detail", { keepPrevious: false });
    await this.renderCustomerDetail();
  },

  // ==================== بانر التذكيرات المستحقة اليوم ====================

  async checkDueBanner() {
    const dueList = await WhatsApp.getCustomersDueForReminder();
    const banner = document.getElementById("dueBanner");
    if (dueList.length > 0) {
      document.getElementById("dueBannerText").textContent = `لديك ${dueList.length} زبون يجب تذكيرهم اليوم`;
      banner.classList.remove("hidden");

      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("مذكّر الديون", {
            body: `لديك ${dueList.length} زبون يستحق تذكيرًا اليوم`,
            icon: "icons/icon-192.png"
          });
        } catch (e) { /* تجاهل بصمت إن لم تكن الإشعارات مدعومة */ }
      }
    } else {
      banner.classList.add("hidden");
    }
  },

  // ==================== لوحة التحكم ====================

  async renderDashboard() {
    const stats = await Debts.computeStats();
    document.getElementById("statTotalDebt").textContent = Utils.formatMoney(stats.totalDebt);
    document.getElementById("statDebtorsCount").textContent = stats.debtorsCount;
    document.getElementById("statDueToday").textContent = stats.dueToday;
    document.getElementById("statOverdue").textContent = stats.overdue;
    document.getElementById("statTotalPaid").textContent = Utils.formatMoney(stats.totalPaid);
    document.getElementById("statRemindersSent").textContent = stats.remindersSent;

    const topOverdue = await Debts.getTopOverdue(5);
    const container = document.getElementById("topOverdueList");
    if (!topOverdue.length) {
      container.innerHTML = `<div class="empty-state">لا يوجد زبائن متأخرون 🎉</div>`;
    } else {
      container.innerHTML = topOverdue.map((c) => Debts.renderOverdueMiniCard(c)).join("");
    }
  },

  // ==================== صفحة الزبائن ====================

  async renderCustomersPage() {
    const search = document.getElementById("customerSearch").value;
    const statusFilter = document.getElementById("customerStatusFilter").value;
    const sortBy = document.getElementById("customerSort").value;

    const all = await Customers.getAll();
    const filtered = Customers.filterAndSort(all, { search, statusFilter, sortBy });
    Customers.renderList(document.getElementById("customersList"), filtered);
  },

  // ==================== تفاصيل الزبون ====================

  async renderCustomerDetail() {
    const customer = await Customers.get(this.selectedCustomerId);
    if (!customer) {
      Utils.showToast("الزبون غير موجود");
      this.navigateTo(this.previousPage);
      return;
    }
    document.getElementById("customerDetailCard").innerHTML = Customers.renderDetail(customer);

    const payments = await Customers.getPayments(customer.id);
    document.getElementById("paymentsHistory").innerHTML = Customers.renderPaymentsHistory(payments);
  },

  // ==================== صفحة الديون ====================

  async renderDebtsPage() {
    const statusFilter = document.getElementById("debtsStatusFilter").value;
    const sortBy = document.getElementById("debtsSort").value;
    const all = await Customers.getAll();
    const filtered = Debts.filterAndSort(all, { statusFilter, sortBy });
    Customers.renderList(document.getElementById("debtsList"), filtered);
  },

  // ==================== صفحة التذكيرات ====================

  async renderRemindersPage() {
    await this.renderReminderTab(this.activeReminderTab);
  },

  async renderReminderTab(tab) {
    this.activeReminderTab = tab;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".tab-pane").forEach((p) => p.classList.add("hidden"));
    document.getElementById(`tab-${tab}`).classList.remove("hidden");

    if (tab === "bulk") {
      const all = await Customers.getAll();
      const withDebt = all.filter((c) => c.remainingAmount > 0);
      const container = document.getElementById("bulkCustomersList");
      if (!withDebt.length) {
        container.innerHTML = `<div class="empty-state">لا يوجد زبائن لديهم ديون مستحقة</div>`;
      } else {
        container.innerHTML = withDebt.map((c) => WhatsApp.renderBulkItem(c)).join("");
      }
      document.getElementById("selectAllCustomers").checked = false;
    } else if (tab === "log") {
      const log = await WhatsApp.getLog();
      const container = document.getElementById("remindersLogList");
      container.innerHTML = log.length
        ? log.map((e) => WhatsApp.renderLogItem(e)).join("")
        : `<div class="empty-state">لا توجد رسائل في السجل بعد</div>`;
    } else if (tab === "template") {
      const template = await WhatsApp.getTemplate();
      const shopName = await WhatsApp.getShopName();
      document.getElementById("templateText").value = template;
      document.getElementById("shopNameInput").value = shopName;
      await this.updateTemplatePreview();
    } else if (tab === "auto") {
      const settings = await WhatsApp.getAutoSettings();
      document.getElementById("autoReminderEnabled").checked = !!settings.enabled;
      document.getElementById("daysBeforeInput").value = settings.daysBefore;
      document.getElementById("daysAfterInput").value = settings.daysAfter;
    }
  },

  async updateTemplatePreview() {
    const template = document.getElementById("templateText").value;
    const shopName = document.getElementById("shopNameInput").value;
    const sample = {
      name: "علي",
      remainingAmount: 150000,
      totalAmount: 200000,
      paidAmount: 50000,
      dueDate: Utils.todayISO()
    };
    const message = WhatsApp.buildMessage(template, sample, shopName);
    document.getElementById("templatePreview").textContent = message;
  },

  // ==================== صفحة التقارير ====================

  async renderReportsPage() {
    const { stats, topDebtors } = await Reports.build();
    document.getElementById("repTotalDebt").textContent = Utils.formatMoney(stats.totalDebt);
    document.getElementById("repTotalPaid").textContent = Utils.formatMoney(stats.totalPaid);
    document.getElementById("repTotalRemaining").textContent = Utils.formatMoney(stats.totalRemaining);
    document.getElementById("repOverdueCount").textContent = stats.overdue;
    document.getElementById("repDueToday").textContent = stats.dueToday;
    document.getElementById("repDueWeek").textContent = stats.dueWeek;
    document.getElementById("repDueMonth").textContent = stats.dueMonth;

    const container = document.getElementById("repTopDebtors");
    container.innerHTML = topDebtors.length
      ? topDebtors.map((c) => Reports.renderDebtorRow(c)).join("")
      : `<div class="empty-state">لا يوجد زبائن مدينون حاليًا</div>`;
  },

  // ==================== صفحة الإعدادات ====================

  async renderSettingsPage() {
    const shopName = await WhatsApp.getShopName();
    document.getElementById("settingsShopName").value = shopName;
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    document.getElementById("settingsDarkMode").checked = dark;

    const pinHash = await DB.getSetting("pinHash", null);
    document.getElementById("btnRemovePin").style.display = pinHash ? "block" : "none";
  },

  // ==================== النوافذ المنبثقة (Modals) ====================

  openModal(id) {
    document.getElementById(id).classList.remove("hidden");
  },
  closeModal(id) {
    document.getElementById(id).classList.add("hidden");
  },

  async openAddCustomerModal() {
    document.getElementById("newCustomerName").value = "";
    document.getElementById("newCustomerPhone").value = "";
    document.getElementById("newCustomerGov").value = "";
    document.getElementById("newCustomerNotes").value = "";
    document.getElementById("phoneError").classList.add("hidden");
    this.openModal("modalAddCustomer");
  },

  async saveNewCustomer() {
    const name = document.getElementById("newCustomerName").value.trim();
    const phoneRaw = document.getElementById("newCustomerPhone").value.trim();
    const gov = document.getElementById("newCustomerGov").value.trim();
    const notes = document.getElementById("newCustomerNotes").value.trim();
    const errorEl = document.getElementById("phoneError");

    if (!name) {
      Utils.showToast("الرجاء إدخال اسم الزبون");
      return;
    }

    const phoneCheck = Utils.normalizeIraqiPhone(phoneRaw);
    if (!phoneCheck.valid) {
      errorEl.classList.remove("hidden");
      return;
    }
    errorEl.classList.add("hidden");

    await Customers.add({ name, phone: phoneCheck.formatted, governorate: gov, notes });
    this.closeModal("modalAddCustomer");
    Utils.showToast("تمت إضافة الزبون بنجاح");
    await this.refreshCurrentPage();
  },

  async openAddDebtModal(preselectedCustomerId) {
    const select = document.getElementById("debtCustomerSelect");
    const all = await Customers.getAll();
    select.innerHTML = all.map((c) => `<option value="${c.id}">${Utils.escapeHtml(c.name)} - ${Utils.displayPhone(c.phone)}</option>`).join("");

    if (preselectedCustomerId) {
      select.value = String(preselectedCustomerId);
    }

    document.getElementById("debtAmount").value = "";
    document.getElementById("debtDueDate").value = Utils.todayISO();
    document.getElementById("debtNotes").value = "";

    if (!all.length) {
      Utils.showToast("أضف زبونًا أولًا قبل تسجيل دين");
      return;
    }
    this.openModal("modalAddDebt");
  },

  async saveNewDebt() {
    const customerId = document.getElementById("debtCustomerSelect").value;
    const amount = Number(document.getElementById("debtAmount").value);
    const dueDate = document.getElementById("debtDueDate").value;
    const notes = document.getElementById("debtNotes").value;

    if (!customerId) {
      Utils.showToast("الرجاء اختيار الزبون");
      return;
    }
    if (!amount || amount <= 0) {
      Utils.showToast("الرجاء إدخال مبلغ صحيح");
      return;
    }
    if (!dueDate) {
      Utils.showToast("الرجاء تحديد تاريخ الاستحقاق");
      return;
    }

    await Debts.addDebt(customerId, amount, dueDate, notes);
    this.closeModal("modalAddDebt");
    Utils.showToast("تمت إضافة الدين بنجاح");
    await this.refreshCurrentPage();
  },

  async openPaymentModal() {
    const customer = await Customers.get(this.selectedCustomerId);
    document.getElementById("paymentRemainingHint").textContent = `المبلغ المتبقي حاليًا: ${Utils.formatMoney(customer.remainingAmount)}`;
    document.getElementById("paymentAmount").value = "";
    document.getElementById("paymentNotes").value = "";
    this.openModal("modalPayment");
  },

  async confirmPayment() {
    const amount = Number(document.getElementById("paymentAmount").value);
    const notes = document.getElementById("paymentNotes").value;

    if (!amount || amount <= 0) {
      Utils.showToast("الرجاء إدخال مبلغ صحيح");
      return;
    }

    await Customers.recordPayment(this.selectedCustomerId, amount, notes);
    this.closeModal("modalPayment");
    Utils.showToast("تم تسجيل الدفعة بنجاح");
    await this.renderCustomerDetail();
  },

  async openSetPinModal() {
    document.getElementById("newPinInput").value = "";
    document.getElementById("confirmPinInput").value = "";
    document.getElementById("pinSetupError").classList.add("hidden");
    this.openModal("modalSetPin");
  },

  async confirmSetPin() {
    const pin1 = document.getElementById("newPinInput").value;
    const pin2 = document.getElementById("confirmPinInput").value;
    const errorEl = document.getElementById("pinSetupError");

    if (!/^\d{4}$/.test(pin1) || pin1 !== pin2) {
      errorEl.classList.remove("hidden");
      return;
    }
    errorEl.classList.add("hidden");
    const hash = await this.sha256Hex(pin1);
    await DB.setSetting("pinHash", hash);
    this.closeModal("modalSetPin");
    Utils.showToast("تم تفعيل قفل التطبيق");
    await this.renderSettingsPage();
  },

  async removePin() {
    await DB.setSetting("pinHash", null);
    Utils.showToast("تم إلغاء قفل التطبيق");
    await this.renderSettingsPage();
  },

  async refreshCurrentPage() {
    if (this.currentPage === "customer-detail") await this.renderCustomerDetail();
    else await this.navigateTo(this.currentPage);
  },

  // ==================== تثبيت التطبيق (PWA) ====================

  bindInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
    });
  },

  async triggerInstall() {
    if (!this.deferredInstallPrompt) {
      Utils.showToast("التثبيت غير متاح الآن. من قائمة المتصفح اختر «إضافة إلى الشاشة الرئيسية»");
      return;
    }
    this.deferredInstallPrompt.prompt();
    await this.deferredInstallPrompt.userChoice;
    this.deferredInstallPrompt = null;
  },

  // ==================== ربط الأحداث ====================

  bindGlobalEvents() {
    // شريط التنقل السفلي
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.navigateTo(btn.dataset.page));
    });

    // زر الرجوع
    document.getElementById("btnBack").addEventListener("click", () => this.navigateTo(this.previousPage));

    // الوضع الليلي
    document.getElementById("btnTheme").addEventListener("click", () => this.toggleTheme());

    // بانر التذكيرات
    document.getElementById("dueBannerBtn").addEventListener("click", () => {
      this.navigateTo("reminders");
    });

    // ---------- لوحة التحكم ----------
    document.getElementById("btnDashAddDebt").addEventListener("click", () => this.openAddDebtModal());
    document.getElementById("btnDashAddCustomer").addEventListener("click", () => this.openAddCustomerModal());
    document.getElementById("btnDashSendReminders").addEventListener("click", () => this.navigateTo("reminders"));

    document.getElementById("topOverdueList").addEventListener("click", (e) => {
      const card = e.target.closest("[data-id]");
      if (card) this.openCustomerDetail(card.dataset.id);
    });

    // ---------- الزبائن ----------
    document.getElementById("customerSearch").addEventListener("input", () => this.renderCustomersPage());
    document.getElementById("customerStatusFilter").addEventListener("change", () => this.renderCustomersPage());
    document.getElementById("customerSort").addEventListener("change", () => this.renderCustomersPage());
    document.getElementById("fabAddCustomer").addEventListener("click", () => this.openAddCustomerModal());

    document.getElementById("customersList").addEventListener("click", async (e) => {
      const whatsappBtn = e.target.closest('[data-action="whatsapp"]');
      const viewBtn = e.target.closest('[data-action="view"]');
      if (whatsappBtn) {
        const customer = await Customers.get(whatsappBtn.dataset.id);
        await WhatsApp.sendToCustomer(customer);
        Utils.showToast("تم فتح واتساب للزبون");
        return;
      }
      if (viewBtn) {
        this.openCustomerDetail(viewBtn.dataset.id);
      }
    });

    // ---------- تفاصيل الزبون ----------
    document.getElementById("btnRecordPayment").addEventListener("click", () => this.openPaymentModal());
    document.getElementById("btnSendWhatsappDetail").addEventListener("click", async () => {
      const customer = await Customers.get(this.selectedCustomerId);
      await WhatsApp.sendToCustomer(customer);
      Utils.showToast("تم فتح واتساب للزبون");
    });
    document.getElementById("btnAddDebtToCustomer").addEventListener("click", () => this.openAddDebtModal(this.selectedCustomerId));
    document.getElementById("btnDeleteCustomer").addEventListener("click", async () => {
      if (confirm("هل أنت متأكد من حذف هذا الزبون؟ سيتم حذف جميع بياناته ودفعاته.")) {
        await Customers.delete(this.selectedCustomerId);
        Utils.showToast("تم حذف الزبون");
        this.navigateTo("customers");
      }
    });

    // ---------- الديون ----------
    document.getElementById("debtsStatusFilter").addEventListener("change", () => this.renderDebtsPage());
    document.getElementById("debtsSort").addEventListener("change", () => this.renderDebtsPage());
    document.getElementById("debtsList").addEventListener("click", async (e) => {
      const whatsappBtn = e.target.closest('[data-action="whatsapp"]');
      const viewBtn = e.target.closest('[data-action="view"]');
      if (whatsappBtn) {
        const customer = await Customers.get(whatsappBtn.dataset.id);
        await WhatsApp.sendToCustomer(customer);
        Utils.showToast("تم فتح واتساب للزبون");
        return;
      }
      if (viewBtn) this.openCustomerDetail(viewBtn.dataset.id);
    });

    // ---------- التذكيرات: التبويبات ----------
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.renderReminderTab(btn.dataset.tab));
    });

    document.getElementById("selectAllCustomers").addEventListener("change", (e) => {
      document.querySelectorAll(".bulk-checkbox").forEach((cb) => { cb.checked = e.target.checked; });
    });

    document.getElementById("btnSendBulk").addEventListener("click", () => this.sendBulkReminders());

    document.getElementById("templateText").addEventListener("input", () => this.updateTemplatePreview());
    document.getElementById("shopNameInput").addEventListener("input", () => this.updateTemplatePreview());
    document.getElementById("btnSaveTemplate").addEventListener("click", async () => {
      await WhatsApp.setTemplate(document.getElementById("templateText").value);
      await WhatsApp.setShopName(document.getElementById("shopNameInput").value);
      Utils.showToast("تم حفظ القالب");
    });

    document.getElementById("btnSaveAutoSettings").addEventListener("click", async () => {
      const enabled = document.getElementById("autoReminderEnabled").checked;
      if (enabled && "Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      const daysBefore = Number(document.getElementById("daysBeforeInput").value) || 0;
      const daysAfter = Number(document.getElementById("daysAfterInput").value) || 0;
      await WhatsApp.setAutoSettings({ enabled, daysBefore, daysAfter });
      Utils.showToast("تم حفظ إعدادات التذكير التلقائي");
      await this.checkDueBanner();
    });

    document.getElementById("remindersLogList").addEventListener("click", () => {}); // للتوسع المستقبلي

    // ---------- التقارير ----------
    document.getElementById("repTopDebtors").addEventListener("click", (e) => {
      const card = e.target.closest("[data-id]");
      if (card) this.openCustomerDetail(card.dataset.id);
    });
    document.getElementById("btnExportExcel").addEventListener("click", async () => {
      await Backup.exportCSV();
      Utils.showToast("تم تصدير الملف بنجاح");
    });

    // ---------- الإعدادات ----------
    document.getElementById("settingsDarkMode").addEventListener("change", () => this.toggleTheme());
    document.getElementById("btnInstallApp").addEventListener("click", () => this.triggerInstall());
    document.getElementById("btnSetPin").addEventListener("click", () => this.openSetPinModal());
    document.getElementById("btnRemovePin").addEventListener("click", () => this.removePin());
    document.getElementById("btnSaveShopName").addEventListener("click", async () => {
      await WhatsApp.setShopName(document.getElementById("settingsShopName").value.trim());
      Utils.showToast("تم حفظ اسم المحل");
    });

    document.getElementById("btnBackupExport").addEventListener("click", async () => {
      await Backup.exportAll();
      Utils.showToast("تم تصدير النسخة الاحتياطية");
    });
    document.getElementById("btnBackupImport").addEventListener("click", () => {
      document.getElementById("backupFileInput").click();
    });
    document.getElementById("backupFileInput").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm("سيتم استبدال جميع البيانات الحالية بالنسخة الاحتياطية المختارة. هل تريد المتابعة؟")) {
        e.target.value = "";
        return;
      }
      try {
        const result = await Backup.importFromFile(file);
        Utils.showToast(`تمت الاستعادة: ${result.customersCount} زبون`);
        await Customers.refreshAllStatuses();
        await this.refreshCurrentPage();
      } catch (err) {
        Utils.showToast("فشلت عملية الاستعادة: " + err.message);
      }
      e.target.value = "";
    });

    // ---------- المودالات: إغلاق ----------
    document.querySelectorAll(".close-modal").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const overlay = e.target.closest(".modal-overlay");
        overlay.classList.add("hidden");
      });
    });
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.add("hidden");
      });
    });

    document.getElementById("btnSaveCustomer").addEventListener("click", () => this.saveNewCustomer());
    document.getElementById("btnSaveDebt").addEventListener("click", () => this.saveNewDebt());
    document.getElementById("btnConfirmPayment").addEventListener("click", () => this.confirmPayment());
    document.getElementById("btnConfirmSetPin").addEventListener("click", () => this.confirmSetPin());
  },

  // إرسال جماعي: نفتح جميع نوافذ واتساب أولًا (بشكل متزامن قدر الإمكان لتجنّب حظر المتصفح للنوافذ المنبثقة)
  // ثم نسجل كل عملية في سجل التذكيرات
  async sendBulkReminders() {
    const checked = Array.from(document.querySelectorAll(".bulk-checkbox:checked")).map((cb) => Number(cb.value));
    if (!checked.length) {
      Utils.showToast("الرجاء تحديد زبون واحد على الأقل");
      return;
    }

    const template = await WhatsApp.getTemplate();
    const shopName = await WhatsApp.getShopName();
    const all = await Customers.getAll();
    const selectedCustomers = all.filter((c) => checked.includes(c.id));

    let openedCount = 0;
    for (const customer of selectedCustomers) {
      const message = WhatsApp.buildMessage(template, customer, shopName);
      const link = WhatsApp.buildWaLink(customer.phone, message);
      const win = window.open(link, "_blank");
      const status = win ? "تم فتح واتساب" : "لم يتم الإرسال";
      if (win) openedCount++;

      await DB.add(DB.STORE_REMINDERS, {
        customerId: customer.id,
        customerName: customer.name,
        phone: customer.phone,
        amount: customer.remainingAmount,
        status,
        createdAt: new Date().toISOString()
      });
    }

    if (openedCount < selectedCustomers.length) {
      Utils.showToast(`تم فتح ${openedCount} من ${selectedCustomers.length}. قد يحتاج المتصفح للسماح بالنوافذ المنبثقة`);
    } else {
      Utils.showToast(`تم فتح واتساب لـ ${openedCount} زبون`);
    }

    await this.renderReminderTab("log");
    await this.renderDashboard();
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
