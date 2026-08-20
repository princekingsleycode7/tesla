/**
 * Tesla Investor Portal Dashboard JavaScript Application
 * Manages full authenticated dashboard experience across all 7 sections.
 */
(function () {
  const TOKEN_KEY = 'tesla_auth_token';
  const API_BASE = '/api/v1';

  // Application State
  let currentUser = null;
  let currentSection = 'overview';
  let overviewData = null;
  let investmentsData = null;
  let transactionsData = null;
  let paymentsData = null;
  let activityData = null;
  let profileData = null;
  let settingsData = null;
  let availablePlans = [];

  // Pagination states
  const pagination = {
    investments: { page: 1, limit: 10, totalPages: 1 },
    transactions: { page: 1, limit: 10, totalPages: 1 },
    payments: { page: 1, limit: 10, totalPages: 1 },
    activity: { page: 1, limit: 10, totalPages: 1 }
  };

  document.addEventListener('DOMContentLoaded', initDashboard);

  function getStoredToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStoredToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  async function apiCall(endpoint, method = 'GET', body = null) {
    const token = getStoredToken();
    if (!token && !endpoint.includes('/auth/login')) {
      redirectToLogin();
      return { ok: false, status: 401, data: { error: { message: 'Unauthenticated' } } };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, options);
      if (response.status === 401) {
        setStoredToken(null);
        redirectToLogin();
        return { ok: false, status: 401, data: { error: { message: 'Session expired' } } };
      }
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, data };
    } catch (err) {
      console.error(`API Call Error (${endpoint}):`, err);
      return { ok: false, status: 500, data: { error: { message: 'Network or server error' } } };
    }
  }

  function redirectToLogin() {
    window.location.href = '/?action=login';
  }

  async function initDashboard() {
    setupNavigation();
    setupForms();

    // Verify authenticated user session
    const res = await apiCall('/auth/me', 'GET');
    if (!res.ok || !res.data.success || !res.data.data.user) {
      redirectToLogin();
      return;
    }

    currentUser = res.data.data.user;
    renderUserInfo(currentUser);

    // Fetch initial data
    await Promise.all([
      loadOverviewData(),
      loadPlansData(),
      loadProfileData(),
      loadSettingsData()
    ]);

    // Handle hash route or default section
    const hash = window.location.hash.replace('#', '');
    if (['overview', 'investments', 'transactions', 'payments', 'activity', 'profile', 'settings'].includes(hash)) {
      switchSection(hash);
    } else {
      switchSection('overview');
    }
  }

  function renderUserInfo(user) {
    const nameEls = document.querySelectorAll('.user-display-name');
    const emailEls = document.querySelectorAll('.user-display-email');
    const roleEls = document.querySelectorAll('.user-display-role');

    const fullName = `${user.firstName || 'Investor'} ${user.lastName || ''}`.trim();
    nameEls.forEach(el => el.textContent = fullName);
    emailEls.forEach(el => el.textContent = user.email || '');
    roleEls.forEach(el => el.textContent = (user.role || 'INVESTOR').toUpperCase());
  }

  function setupNavigation() {
    const navItems = document.querySelectorAll('[data-section]');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.getAttribute('data-section');
        switchSection(section);
      });
    });

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        setStoredToken(null);
        window.location.href = '/';
      });
    }
  }

  async function switchSection(section) {
    currentSection = section;
    window.location.hash = section;

    // Update nav active states
    document.querySelectorAll('[data-section]').forEach(el => {
      if (el.getAttribute('data-section') === section) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // Hide all section panels, show active
    document.querySelectorAll('.dashboard-section').forEach(sec => {
      sec.style.display = 'none';
    });
    const activeSec = document.getElementById(`section-${section}`);
    if (activeSec) activeSec.style.display = 'block';

    // Load section specific data
    if (section === 'overview') await loadOverviewData();
    else if (section === 'investments') await loadInvestmentsData();
    else if (section === 'transactions') await loadTransactionsData();
    else if (section === 'payments') await loadPaymentsData();
    else if (section === 'activity') await loadActivityData();
    else if (section === 'profile') await loadProfileData();
    else if (section === 'settings') await loadSettingsData();
  }

  // --- DATA LOADERS ---

  async function loadOverviewData() {
    showLoader('overview-loader');
    const res = await apiCall('/dashboard/overview', 'GET');
    hideLoader('overview-loader');

    if (res.ok && res.data.success) {
      overviewData = res.data.data;
      renderOverviewCards(overviewData.summary);
      renderRecentInvestments(overviewData.recentInvestments);
      renderRecentActivity(overviewData.recentActivity);
    }
  }

  async function loadPlansData() {
    const res = await apiCall('/plans', 'GET');
    if (res.ok && res.data.success) {
      availablePlans = res.data.data.plans || [];
      populatePlanSelectors(availablePlans);
    }
  }

  async function loadInvestmentsData(status = '') {
    showLoader('investments-loader');
    const { page, limit } = pagination.investments;
    let url = `/dashboard/investments?page=${page}&limit=${limit}`;
    if (status) url += `&status=${status}`;

    const res = await apiCall(url, 'GET');
    hideLoader('investments-loader');

    if (res.ok && res.data.success) {
      investmentsData = res.data.data;
      pagination.investments.totalPages = investmentsData.pagination.totalPages;
      renderInvestmentsTable(investmentsData.investments);
      renderPagination('investments', investmentsData.pagination);
    }
  }

  async function loadTransactionsData(type = '', status = '') {
    showLoader('transactions-loader');
    const { page, limit } = pagination.transactions;
    let url = `/dashboard/transactions?page=${page}&limit=${limit}`;
    if (type) url += `&type=${type}`;
    if (status) url += `&status=${status}`;

    const res = await apiCall(url, 'GET');
    hideLoader('transactions-loader');

    if (res.ok && res.data.success) {
      transactionsData = res.data.data;
      pagination.transactions.totalPages = transactionsData.pagination.totalPages;
      renderTransactionsTable(transactionsData.transactions);
      renderPagination('transactions', transactionsData.pagination);
    }
  }

  async function loadPaymentsData(status = '') {
    showLoader('payments-loader');
    const { page, limit } = pagination.payments;
    let url = `/dashboard/payments?page=${page}&limit=${limit}`;
    if (status) url += `&status=${status}`;

    const res = await apiCall(url, 'GET');
    hideLoader('payments-loader');

    if (res.ok && res.data.success) {
      paymentsData = res.data.data;
      pagination.payments.totalPages = paymentsData.pagination.totalPages;
      renderPaymentsTable(paymentsData.payments);
      renderPagination('payments', paymentsData.pagination);
    }
  }

  async function loadActivityData() {
    showLoader('activity-loader');
    const { page, limit } = pagination.activity;
    const url = `/dashboard/activity?page=${page}&limit=${limit}`;

    const res = await apiCall(url, 'GET');
    hideLoader('activity-loader');

    if (res.ok && res.data.success) {
      activityData = res.data.data;
      pagination.activity.totalPages = activityData.pagination.totalPages;
      renderActivityTable(activityData.activities);
      renderPagination('activity', activityData.pagination);
    }
  }

  async function loadProfileData() {
    const res = await apiCall('/profile', 'GET');
    if (res.ok && res.data.success) {
      profileData = res.data.data.profile;
      populateProfileForm(profileData);
    }
  }

  async function loadSettingsData() {
    const res = await apiCall('/settings', 'GET');
    if (res.ok && res.data.success) {
      settingsData = res.data.data.settings;
      populateSettingsForm(settingsData);
    }
  }

  // --- RENDERERS ---

  function renderOverviewCards(summary) {
    if (!summary) return;

    const totalInvestedEl = document.getElementById('stat-total-invested');
    const activeCountEl = document.getElementById('stat-active-count');
    const portfolioValueEl = document.getElementById('stat-portfolio-value');
    const returnsEl = document.getElementById('stat-returns');
    const pendingTxEl = document.getElementById('stat-pending-tx');
    const activityCountEl = document.getElementById('stat-activity-count');

    if (totalInvestedEl) totalInvestedEl.textContent = `$${Number(summary.totalInvested).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (activeCountEl) activeCountEl.textContent = summary.activeInvestments;
    if (portfolioValueEl) portfolioValueEl.textContent = `$${Number(summary.portfolioValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (returnsEl) returnsEl.textContent = `$${Number(summary.returns).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (pendingTxEl) pendingTxEl.textContent = `${summary.pendingTransactions} ($${Number(summary.pendingAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })})`;
    if (activityCountEl) activityCountEl.textContent = summary.totalActivities;
  }

  function renderRecentInvestments(investments) {
    const container = document.getElementById('overview-recent-investments');
    if (!container) return;

    if (!investments || investments.length === 0) {
      container.innerHTML = `<div class="empty-state">No active investments found. Allocate capital below to begin.</div>`;
      return;
    }

    container.innerHTML = investments.map(inv => `
      <div class="list-card">
        <div class="list-card-header">
          <div>
            <div class="list-card-title">${escapeHtml(inv.planName || 'Tesla Plan')}</div>
            <div class="list-card-subtitle">CERT: ${escapeHtml(inv.certificateId || 'TSLA-CERT')}</div>
          </div>
          <div class="text-right">
            <div class="list-card-amount">$${Number(inv.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <span class="badge badge-${(inv.status || '').toLowerCase()}">${escapeHtml(inv.status)}</span>
          </div>
        </div>
        <div class="list-card-footer">
          <span>Units: <strong>${Number(inv.units).toFixed(4)}</strong></span>
          <span>Return Rate: <strong>${inv.returnRate}%</strong></span>
        </div>
      </div>
    `).join('');
  }

  function renderRecentActivity(activities) {
    const container = document.getElementById('overview-recent-activity');
    if (!container) return;

    if (!activities || activities.length === 0) {
      container.innerHTML = `<div class="empty-state">No recent activity recorded.</div>`;
      return;
    }

    container.innerHTML = activities.map(act => `
      <div class="activity-item">
        <div class="activity-icon"><i class="fas fa-shield-alt"></i></div>
        <div class="activity-details">
          <div class="activity-action">${escapeHtml(act.action)}</div>
          <div class="activity-meta">${escapeHtml(act.entityType)} ${act.entityId ? '• ' + escapeHtml(act.entityId) : ''}</div>
        </div>
        <div class="activity-time">${formatDate(act.createdAt)}</div>
      </div>
    `).join('');
  }

  function renderInvestmentsTable(investments) {
    const container = document.getElementById('investments-table-body');
    if (!container) return;

    if (!investments || investments.length === 0) {
      container.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-muted">No investments found matching filter.</td></tr>`;
      return;
    }

    container.innerHTML = investments.map(inv => `
      <tr>
        <td>
          <div class="font-bold text-white">${escapeHtml(inv.planName || 'Tesla Direct')}</div>
          <div class="text-xs text-muted font-mono">${escapeHtml(inv.planTicker || 'TSLA')}</div>
        </td>
        <td class="font-mono text-xs">${escapeHtml(inv.certificateId || 'N/A')}</td>
        <td>${Number(inv.units).toFixed(4)}</td>
        <td class="font-bold text-accent-green">$${Number(inv.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td>${inv.returnRate ? inv.returnRate + '%' : 'N/A'}</td>
        <td><span class="badge badge-${(inv.status || '').toLowerCase()}">${escapeHtml(inv.status)}</span></td>
        <td class="text-xs">${formatDate(inv.startDate)}</td>
        <td class="text-xs">${inv.maturityDate ? formatDate(inv.maturityDate) : 'Perpetual'}</td>
      </tr>
    `).join('');
  }

  function renderTransactionsTable(transactions) {
    const container = document.getElementById('transactions-table-body');
    if (!container) return;

    if (!transactions || transactions.length === 0) {
      container.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-muted">No transactions recorded.</td></tr>`;
      return;
    }

    container.innerHTML = transactions.map(tx => `
      <tr>
        <td class="font-mono text-xs text-white">${escapeHtml(tx.referenceId)}</td>
        <td><span class="badge badge-outline">${escapeHtml(tx.type)}</span></td>
        <td class="font-bold text-accent-green">$${Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${escapeHtml(tx.currency)}</td>
        <td><span class="badge badge-${(tx.status || '').toLowerCase()}">${escapeHtml(tx.status)}</span></td>
        <td class="text-xs text-muted">${escapeHtml(tx.description || '-')}</td>
        <td class="text-xs">${formatDate(tx.createdAt)}</td>
      </tr>
    `).join('');
  }

  function renderPaymentsTable(payments) {
    const container = document.getElementById('payments-table-body');
    if (!container) return;

    if (!payments || payments.length === 0) {
      container.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-muted">No payments initialized yet.</td></tr>`;
      return;
    }

    container.innerHTML = payments.map(pm => `
      <tr>
        <td class="font-mono text-xs text-white">${escapeHtml(pm.id)}</td>
        <td><span class="badge badge-provider">${escapeHtml(pm.provider)}</span></td>
        <td class="font-bold text-accent-green">$${Number(pm.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${escapeHtml(pm.currency)}</td>
        <td><span class="badge badge-${(pm.status || '').toLowerCase()}">${escapeHtml(pm.status)}</span></td>
        <td class="text-xs text-muted font-mono">${escapeHtml(pm.idempotencyKey || '-')}</td>
        <td class="text-xs">${formatDate(pm.createdAt)}</td>
      </tr>
    `).join('');
  }

  function renderActivityTable(activities) {
    const container = document.getElementById('activity-table-body');
    if (!container) return;

    if (!activities || activities.length === 0) {
      container.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-muted">No security or system activity recorded.</td></tr>`;
      return;
    }

    container.innerHTML = activities.map(act => `
      <tr>
        <td class="text-xs font-mono">${formatDate(act.createdAt, true)}</td>
        <td class="font-bold text-white">${escapeHtml(act.action)}</td>
        <td><span class="badge badge-outline">${escapeHtml(act.entityType)}</span></td>
        <td class="text-xs font-mono text-muted">${escapeHtml(act.ipAddress || 'Internal')}</td>
        <td class="text-xs text-muted font-mono">${escapeHtml(act.entityId || '-')}</td>
      </tr>
    `).join('');
  }

  function renderPagination(sectionKey, paginationObj) {
    const container = document.getElementById(`${sectionKey}-pagination`);
    if (!container) return;

    const { page, totalPages, total } = paginationObj;
    container.innerHTML = `
      <div class="pagination-info">Showing page <strong>${page}</strong> of <strong>${totalPages}</strong> (${total} total records)</div>
      <div class="pagination-buttons">
        <button class="btn btn-sm btn-outline" ${page <= 1 ? 'disabled' : ''} data-page-action="${sectionKey}-prev"><i class="fas fa-chevron-left"></i> Prev</button>
        <button class="btn btn-sm btn-outline" ${page >= totalPages ? 'disabled' : ''} data-page-action="${sectionKey}-next">Next <i class="fas fa-chevron-right"></i></button>
      </div>
    `;

    const prevBtn = container.querySelector(`[data-page-action="${sectionKey}-prev"]`);
    const nextBtn = container.querySelector(`[data-page-action="${sectionKey}-next"]`);

    if (prevBtn) {
      prevBtn.onclick = () => {
        if (pagination[sectionKey].page > 1) {
          pagination[sectionKey].page--;
          reloadSectionData(sectionKey);
        }
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        if (pagination[sectionKey].page < pagination[sectionKey].totalPages) {
          pagination[sectionKey].page++;
          reloadSectionData(sectionKey);
        }
      };
    }
  }

  function reloadSectionData(sectionKey) {
    if (sectionKey === 'investments') loadInvestmentsData();
    else if (sectionKey === 'transactions') loadTransactionsData();
    else if (sectionKey === 'payments') loadPaymentsData();
    else if (sectionKey === 'activity') loadActivityData();
  }

  function populatePlanSelectors(plans) {
    const selectors = document.querySelectorAll('.plan-select-dropdown');
    selectors.forEach(select => {
      const currentVal = select.value;
      select.innerHTML = '<option value="">Select an Investment Plan</option>' + plans.map(p => `
        <option value="${p.id}" data-price="${p.unitPrice}" data-duration="${p.durationMonths}" data-roi="${p.expectedRoiPercentage}">
          ${escapeHtml(p.name)} (${p.ticker}) - $${Number(p.unitPrice).toFixed(2)}/unit [${p.expectedRoiPercentage}% ROI]
        </option>
      `).join('');
      if (currentVal) select.value = currentVal;
    });
  }

  function populateProfileForm(profile) {
    if (!profile) return;
    setInputValue('profile-first-name', profile.firstName);
    setInputValue('profile-last-name', profile.lastName);
    setInputValue('profile-phone', profile.phone);
    setInputValue('profile-address', profile.streetAddress);
    setInputValue('profile-city', profile.city);
    setInputValue('profile-state', profile.state);
    setInputValue('profile-postal', profile.postalCode);
    setInputValue('profile-country', profile.country);

    const kycBadge = document.getElementById('profile-kyc-badge');
    if (kycBadge) {
      kycBadge.textContent = profile.kycStatus || 'VERIFIED';
      kycBadge.className = `badge badge-${(profile.kycStatus || 'VERIFIED').toLowerCase()}`;
    }
  }

  function populateSettingsForm(settings) {
    if (!settings) return;
    setCheckboxValue('setting-email-notifications', settings.emailNotifications);
    setCheckboxValue('setting-sms-notifications', settings.smsNotifications);
    setCheckboxValue('setting-2fa', settings.twoFactorEnabled);
    setInputValue('setting-currency', settings.currencyPreference || 'USD');
  }

  function setupForms() {
    // Investment Creation Form
    const invForm = document.getElementById('create-investment-form');
    if (invForm) {
      invForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const planId = document.getElementById('inv-form-plan').value;
        const amount = parseFloat(document.getElementById('inv-form-amount').value);
        const paymentMethod = document.getElementById('inv-form-method').value;
        const alertEl = document.getElementById('inv-form-alert');

        if (!planId || isNaN(amount) || amount <= 0) {
          showAlertEl(alertEl, 'Please select a plan and enter a positive amount.', 'error');
          return;
        }

        const idempotencyKey = `dash-inv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const res = await apiCall('/investments', 'POST', { planId, amount, paymentMethod, idempotencyKey });

        if (res.ok && res.data.success) {
          showAlertEl(alertEl, 'Investment successfully executed & allocated!', 'success');
          invForm.reset();
          await loadOverviewData();
          await loadInvestmentsData();
        } else {
          showAlertEl(alertEl, res.data?.error?.message || 'Failed to allocate investment.', 'error');
        }
      });
    }

    // Payment Initialization Form
    const payForm = document.getElementById('initialize-payment-form');
    if (payForm) {
      payForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('pay-form-amount').value);
        const provider = document.getElementById('pay-form-provider').value;
        const planId = document.getElementById('pay-form-plan').value || null;
        const alertEl = document.getElementById('pay-form-alert');

        if (isNaN(amount) || amount <= 0) {
          showAlertEl(alertEl, 'Please enter a valid positive payment amount.', 'error');
          return;
        }

        const idempotencyKey = `dash-pay-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const res = await apiCall('/payments/initialize', 'POST', { amount, provider, planId, idempotencyKey });

        if (res.ok && res.data.success) {
          showAlertEl(alertEl, 'Payment order initialized successfully!', 'success');
          payForm.reset();
          await loadOverviewData();
          await loadPaymentsData();
        } else {
          showAlertEl(alertEl, res.data?.error?.message || 'Failed to initialize payment.', 'error');
        }
      });
    }

    // Profile Update Form
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const alertEl = document.getElementById('profile-form-alert');
        const body = {
          firstName: getInputValue('profile-first-name'),
          lastName: getInputValue('profile-last-name'),
          phone: getInputValue('profile-phone'),
          streetAddress: getInputValue('profile-address'),
          city: getInputValue('profile-city'),
          state: getInputValue('profile-state'),
          postalCode: getInputValue('profile-postal'),
          country: getInputValue('profile-country')
        };

        const res = await apiCall('/profile', 'PUT', body);
        if (res.ok && res.data.success) {
          showAlertEl(alertEl, 'Profile updated successfully!', 'success');
          renderUserInfo({ ...currentUser, ...body });
        } else {
          showAlertEl(alertEl, res.data?.error?.message || 'Failed to update profile.', 'error');
        }
      });
    }

    // Settings Update Form
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const alertEl = document.getElementById('settings-form-alert');
        const body = {
          emailNotifications: getCheckboxValue('setting-email-notifications'),
          smsNotifications: getCheckboxValue('setting-sms-notifications'),
          twoFactorEnabled: getCheckboxValue('setting-2fa'),
          currencyPreference: getInputValue('setting-currency')
        };

        const res = await apiCall('/settings', 'PUT', body);
        if (res.ok && res.data.success) {
          showAlertEl(alertEl, 'Settings updated successfully!', 'success');
        } else {
          showAlertEl(alertEl, res.data?.error?.message || 'Failed to update settings.', 'error');
        }
      });
    }

    // Investment Filter Event
    const invFilter = document.getElementById('investments-status-filter');
    if (invFilter) {
      invFilter.addEventListener('change', () => {
        pagination.investments.page = 1;
        loadInvestmentsData(invFilter.value);
      });
    }

    // Transactions Filter Events
    const txTypeFilter = document.getElementById('transactions-type-filter');
    const txStatusFilter = document.getElementById('transactions-status-filter');
    if (txTypeFilter || txStatusFilter) {
      const applyTxFilter = () => {
        pagination.transactions.page = 1;
        loadTransactionsData(txTypeFilter ? txTypeFilter.value : '', txStatusFilter ? txStatusFilter.value : '');
      };
      if (txTypeFilter) txTypeFilter.addEventListener('change', applyTxFilter);
      if (txStatusFilter) txStatusFilter.addEventListener('change', applyTxFilter);
    }
  }

  // --- UTILITY HELPERS ---

  function formatDate(dateStr, includeTime = false) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return String(dateStr);

    if (includeTime) {
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showLoader(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'block';
  }

  function hideLoader(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function setInputValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  }

  function getInputValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  function setCheckboxValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(val);
  }

  function getCheckboxValue(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
  }

  function showAlertEl(el, message, type = 'success') {
    if (!el) return;
    el.textContent = message;
    el.className = `alert alert-${type}`;
    el.style.display = 'block';
    setTimeout(() => {
      el.style.display = 'none';
    }, 4000);
  }

})();
