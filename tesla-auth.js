/**
 * Tesla Investor Authentication & Portal Integration
 * Connects frontend directly to /api/v1/auth, /api/v1/profile, and /api/v1/settings REST APIs.
 */
(function () {
  const API_AUTH = '/api/v1/auth';
  const API_PROFILE = '/api/v1/profile';
  const API_SETTINGS = '/api/v1/settings';
  const API_INVESTMENTS = '/api/v1/investments';
  const API_PLANS = '/api/v1/plans';
  const TOKEN_KEY = 'tesla_auth_token';

  // State
  let currentUser = null;
  let currentProfile = null;
  let currentSettings = null;
  let currentPlans = [];
  let currentInvestments = [];
  let currentSummary = null;
  let currentHistory = [];
  let activeTab = 'login'; // 'login' | 'register' | 'forgot' | 'portal'
  let activePortalSubTab = 'investments'; // 'investments' | 'profile' | 'security' | 'notifications' | 'preferences'

  // Initialize UI on DOM load
  document.addEventListener('DOMContentLoaded', initAuthModal);

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

  async function apiCall(url, method = 'GET', body = null) {
    const token = getStoredToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  }

  async function checkSession() {
    const token = getStoredToken();
    if (!token) {
      updateNavUserState(null);
      return;
    }

    try {
      const res = await apiCall(`${API_AUTH}/me`, 'GET');
      if (res.ok && res.data.success && res.data.data.user) {
        currentUser = res.data.data.user;
        updateNavUserState(currentUser);
        // Pre-fetch profile and settings in background
        loadProfileData();
        loadSettingsData();
      } else {
        setStoredToken(null);
        currentUser = null;
        updateNavUserState(null);
      }
    } catch (err) {
      console.warn('Authentication check deferred:', err);
    }
  }

  async function loadProfileData() {
    try {
      const res = await apiCall(API_PROFILE, 'GET');
      if (res.ok && res.data.success && res.data.data.profile) {
        currentProfile = res.data.data.profile;
        populateProfileForm(currentProfile);
      }
    } catch (err) {
      console.warn('Failed to fetch profile:', err);
    }
  }

  async function loadSettingsData() {
    try {
      const res = await apiCall(API_SETTINGS, 'GET');
      if (res.ok && res.data.success && res.data.data.settings) {
        currentSettings = res.data.data.settings;
        populateSettingsForm(currentSettings);
      }
    } catch (err) {
      console.warn('Failed to fetch settings:', err);
    }
  }

  function initAuthModal() {
    injectAuthStyles();
    injectAuthHTML();
    bindGlobalTriggers();
    checkSession();
  }

  function injectAuthStyles() {
    if (document.getElementById('tesla-auth-styles')) return;
    const style = document.createElement('style');
    style.id = 'tesla-auth-styles';
    style.innerHTML = `
      #tesla-auth-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.88);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        z-index: 9990;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
      }
      #tesla-auth-backdrop.active {
        opacity: 1;
        visibility: visible;
      }
      .tesla-auth-card {
        background: #0b0b0d;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        width: 100%;
        max-width: 480px;
        max-height: 90vh;
        overflow-y: auto;
        padding: 28px;
        color: #f5f5f5;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.9), 0 0 40px rgba(232, 33, 39, 0.12);
        position: relative;
        transform: translateY(20px) scale(0.98);
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.2) transparent;
      }
      .tesla-auth-card.portal-mode {
        max-width: 600px;
      }
      #tesla-auth-backdrop.active .tesla-auth-card {
        transform: translateY(0) scale(1);
      }
      .auth-close-btn {
        position: absolute;
        top: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #8a8a8a;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        z-index: 10;
      }
      .auth-close-btn:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.15);
      }
      .auth-tabs {
        display: flex;
        gap: 6px;
        background: rgba(255, 255, 255, 0.04);
        padding: 4px;
        border-radius: 999px;
        margin-bottom: 20px;
      }
      .auth-tab-btn {
        flex: 1;
        padding: 8px 10px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        border-radius: 999px;
        border: none;
        background: transparent;
        color: #8a8a8a;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: center;
        white-space: nowrap;
      }
      .auth-tab-btn.active {
        background: #fff;
        color: #000;
      }
      .portal-subtabs {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 6px;
        background: rgba(255, 255, 255, 0.04);
        padding: 4px;
        border-radius: 12px;
        margin-bottom: 20px;
      }
      .portal-subtab-btn {
        padding: 8px 6px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        border-radius: 8px;
        border: none;
        background: transparent;
        color: #888;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: center;
      }
      .portal-subtab-btn.active {
        background: rgba(232, 33, 39, 0.15);
        color: #ff6b6b;
        border: 1px solid rgba(232, 33, 39, 0.3);
      }
      .auth-input-group {
        margin-bottom: 14px;
      }
      .auth-input-group label {
        display: block;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #8a8a8a;
        margin-bottom: 5px;
        font-weight: 600;
      }
      .auth-input, .auth-select {
        width: 100%;
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #fff;
        font-size: 13px;
        box-sizing: border-box;
        transition: border-color 0.2s ease, background 0.2s ease;
      }
      .auth-input:focus, .auth-select:focus {
        outline: none;
        border-color: #E82127;
        background: rgba(255, 255, 255, 0.08);
      }
      .auth-select option {
        background: #111;
        color: #fff;
      }
      .auth-submit-btn {
        width: 100%;
        padding: 12px 16px;
        background: #E82127;
        color: #fff;
        border: none;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        cursor: pointer;
        transition: opacity 0.2s ease, transform 0.2s ease;
        margin-top: 6px;
      }
      .auth-submit-btn:hover {
        opacity: 0.92;
        transform: translateY(-1px);
      }
      .auth-submit-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .auth-secondary-btn {
        padding: 8px 14px;
        background: rgba(255, 255, 255, 0.06);
        color: #ddd;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .auth-secondary-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
      }
      .auth-alert {
        padding: 10px 14px;
        border-radius: 8px;
        font-size: 12px;
        margin-bottom: 16px;
        display: none;
        animation: fadeIn 0.2s ease;
      }
      .auth-alert.error {
        display: block;
        background: rgba(232, 33, 39, 0.15);
        border: 1px solid rgba(232, 33, 39, 0.4);
        color: #ff8080;
      }
      .auth-alert.success {
        display: block;
        background: rgba(34, 197, 94, 0.15);
        border: 1px solid rgba(34, 197, 94, 0.4);
        color: #86efac;
      }
      .auth-link {
        color: #E82127;
        font-size: 12px;
        cursor: pointer;
        text-decoration: none;
      }
      .auth-link:hover {
        text-decoration: underline;
      }
      .toggle-switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 8px;
        margin-bottom: 8px;
      }
      .toggle-info {
        display: flex;
        flex-direction: column;
      }
      .toggle-title {
        font-size: 12px;
        font-weight: 600;
        color: #eee;
      }
      .toggle-desc {
        font-size: 10px;
        color: #888;
        margin-top: 2px;
      }
      .toggle-input {
        appearance: none;
        -webkit-appearance: none;
        width: 38px;
        height: 20px;
        background: #333;
        border-radius: 999px;
        position: relative;
        cursor: pointer;
        outline: none;
        transition: background 0.2s ease;
      }
      .toggle-input:checked {
        background: #E82127;
      }
      .toggle-input::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        background: #fff;
        border-radius: 50%;
        transition: transform 0.2s ease;
      }
      .toggle-input:checked::after {
        transform: translateX(18px);
      }
      .avatar-wrapper {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 16px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
      }
      .avatar-preview {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: #1e1e24;
        border: 2px solid rgba(232, 33, 39, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        font-weight: bold;
        font-size: 18px;
        color: #fff;
        flex-shrink: 0;
      }
      .avatar-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    `;
    document.head.appendChild(style);
  }

  function injectAuthHTML() {
    if (document.getElementById('tesla-auth-backdrop')) return;
    const div = document.createElement('div');
    div.id = 'tesla-auth-backdrop';
    div.innerHTML = `
      <div class="tesla-auth-card" id="tesla-auth-modal">
        <button class="auth-close-btn" id="auth-close-btn" aria-label="Close">✕</button>
        
        <div style="text-align: center; margin-bottom: 16px;">
          <div style="font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 18px; letter-spacing: 0.1em; margin-bottom: 2px;">
            TESLA <span style="color: #E82127;">PORTAL</span>
          </div>
          <div style="font-size: 11px; color: #8a8a8a;" id="auth-modal-subtitle">
            Investor & Shareholder Access
          </div>
        </div>

        <div class="auth-tabs" id="auth-tabs-container">
          <button class="auth-tab-btn active" data-tab="login" id="tab-login-btn">Sign In</button>
          <button class="auth-tab-btn" data-tab="register" id="tab-register-btn">Register</button>
        </div>

        <div id="auth-alert" class="auth-alert"></div>

        <!-- 1. LOGIN FORM -->
        <form id="auth-login-form" style="display: block;">
          <div class="auth-input-group">
            <label>Email Address</label>
            <input type="email" class="auth-input" id="login-email" required placeholder="investor@domain.com">
          </div>
          <div class="auth-input-group">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px;">
              <label style="margin-bottom: 0;">Password</label>
              <span class="auth-link" id="goto-forgot-link">Forgot password?</span>
            </div>
            <input type="password" class="auth-input" id="login-password" required placeholder="••••••••">
          </div>
          <button type="submit" class="auth-submit-btn" id="login-submit-btn">Authenticate</button>
        </form>

        <!-- 2. REGISTER FORM -->
        <form id="auth-register-form" style="display: none;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="auth-input-group">
              <label>First Name</label>
              <input type="text" class="auth-input" id="reg-firstname" placeholder="Nikola">
            </div>
            <div class="auth-input-group">
              <label>Last Name</label>
              <input type="text" class="auth-input" id="reg-lastname" placeholder="Tesla">
            </div>
          </div>
          <div class="auth-input-group">
            <label>Email Address</label>
            <input type="email" class="auth-input" id="reg-email" required placeholder="investor@domain.com">
          </div>
          <div class="auth-input-group">
            <label>Password (Min 8 chars, 1 num, 1 spec)</label>
            <input type="password" class="auth-input" id="reg-password" required placeholder="••••••••">
          </div>
          <div class="auth-input-group">
            <label>Country / Jurisdiction</label>
            <input type="text" class="auth-input" id="reg-country" placeholder="United States">
          </div>
          <button type="submit" class="auth-submit-btn" id="reg-submit-btn">Create Investor Account</button>
        </form>

        <!-- 3. FORGOT PASSWORD FORM -->
        <form id="auth-forgot-form" style="display: none;">
          <div class="auth-input-group">
            <label>Registered Email</label>
            <input type="email" class="auth-input" id="forgot-email" required placeholder="investor@domain.com">
          </div>
          <button type="submit" class="auth-submit-btn" id="forgot-submit-btn">Dispatch Reset Link</button>
          <div style="text-align: center; margin-top: 14px;">
            <span class="auth-link" id="goto-login-link">Back to Sign In</span>
          </div>
        </form>

        <!-- 4. AUTHENTICATED PORTAL (PROFILE & SETTINGS) -->
        <div id="auth-profile-view" style="display: none;">
          <!-- Top summary identity card -->
          <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px 16px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="avatar-preview" id="top-avatar-container" style="width: 42px; height: 42px; font-size: 14px;">
                <span id="top-avatar-initials">TS</span>
              </div>
              <div>
                <div style="font-size: 14px; font-weight: 700; color: #fff;" id="profile-summary-name">Verified Investor</div>
                <div style="font-size: 11px; color: #888;" id="profile-summary-email">user@tesla.com</div>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
              <span style="font-size: 9px; font-weight: 700; background: rgba(232,33,39,0.2); color: #ff8080; padding: 2px 8px; border-radius: 999px;" id="profile-role-badge">USER</span>
              <span style="font-size: 9px; background: rgba(34,197,94,0.15); color: #86efac; padding: 2px 8px; border-radius: 999px;" id="profile-email-badge">✓ EMAIL VERIFIED</span>
            </div>
          </div>

          <!-- Portal Subtabs -->
          <div class="portal-subtabs">
            <button class="portal-subtab-btn active" data-subtab="investments" id="subtab-investments-btn">Portfolio</button>
            <button class="portal-subtab-btn" data-subtab="profile" id="subtab-profile-btn">Profile</button>
            <button class="portal-subtab-btn" data-subtab="security" id="subtab-security-btn">Security</button>
            <button class="portal-subtab-btn" data-subtab="notifications" id="subtab-notifs-btn">Notifications</button>
            <button class="portal-subtab-btn" data-subtab="preferences" id="subtab-prefs-btn">Preferences</button>
          </div>

          <!-- SUBTAB 0: INVESTMENTS & PORTFOLIO -->
          <div id="subtab-view-investments" style="display: block;">
            <!-- Portfolio Stats Cards -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px;">
              <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px; text-align: center;">
                <div style="font-size: 9px; text-transform: uppercase; color: #888; letter-spacing: 0.1em; margin-bottom: 4px;">Total Invested</div>
                <div style="font-size: 16px; font-weight: 700; color: #fff;" id="port-total-invested">$0.00</div>
              </div>
              <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px; text-align: center;">
                <div style="font-size: 9px; text-transform: uppercase; color: #888; letter-spacing: 0.1em; margin-bottom: 4px;">Active Holdings</div>
                <div style="font-size: 16px; font-weight: 700; color: #86efac;" id="port-active-holdings">0</div>
              </div>
              <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px; text-align: center;">
                <div style="font-size: 9px; text-transform: uppercase; color: #888; letter-spacing: 0.1em; margin-bottom: 4px;">Est. Payout</div>
                <div style="font-size: 16px; font-weight: 700; color: #ff8080;" id="port-projected-returns">$0.00</div>
              </div>
            </div>

            <!-- New Investment Allocation Form -->
            <div style="background: rgba(232, 33, 39, 0.04); border: 1px solid rgba(232, 33, 39, 0.25); border-radius: 14px; padding: 16px; margin-bottom: 20px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #fff;">
                  Allocate <span style="color: #E82127;">New Capital</span>
                </div>
                <span style="font-size: 10px; color: #888;">Instant Ledger Allocation</span>
              </div>
              
              <form id="portal-investment-form">
                <div class="auth-input-group">
                  <label>Select Strategic Product / Tranche</label>
                  <select class="auth-select" id="inv-plan-select" required>
                    <option value="">Loading available offerings...</option>
                  </select>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                  <div class="auth-input-group">
                    <label>Investment Amount ($ USD)</label>
                    <input type="number" step="any" class="auth-input" id="inv-amount-input" required placeholder="5000">
                  </div>
                  <div class="auth-input-group">
                    <label>Settlement Method</label>
                    <select class="auth-select" id="inv-payment-method">
                      <option value="DIRECT_ALLOCATION">Direct Tranche Allocation</option>
                      <option value="WIRE_TRANSFER">Institutional Wire</option>
                      <option value="ACH_TRANSFER">ACH Direct Debit</option>
                    </select>
                  </div>
                </div>

                <!-- Live Allocation Metrics Preview -->
                <div id="inv-calc-preview" style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 10px; margin-bottom: 14px; display: none;">
                  <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; color: #aaa;">
                    <span>Unit Price:</span>
                    <span id="calc-unit-price" style="color: #fff; font-weight: 600;">$0.00</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; color: #aaa;">
                    <span>Estimated Units:</span>
                    <span id="calc-units" style="color: #86efac; font-weight: 600;">0.000000</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; color: #aaa;">
                    <span>Duration & Maturity:</span>
                    <span id="calc-duration" style="color: #fff; font-weight: 600;">Open Equity</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; font-size: 11px; color: #aaa;">
                    <span>Target ROI / Annual Yield:</span>
                    <span id="calc-roi" style="color: #ff8080; font-weight: 600;">Capital Growth</span>
                  </div>
                </div>

                <button type="submit" class="auth-submit-btn" id="execute-investment-btn">
                  Confirm & Execute Allocation
                </button>
              </form>
            </div>

            <!-- Active User Investments / Certificates List -->
            <div style="margin-bottom: 20px;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #888; letter-spacing: 0.1em; margin-bottom: 10px;">
                Active Certificates & Holdings
              </div>
              <div id="portal-investments-list" style="display: flex; flex-direction: column; gap: 8px;">
                <div style="text-align: center; color: #666; font-size: 12px; padding: 16px;">
                  No active investment tranches. Allocate capital above to issue a digital certificate.
                </div>
              </div>
            </div>

            <!-- Ledger Transactions History -->
            <div>
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #888; letter-spacing: 0.1em; margin-bottom: 10px;">
                Immutable Ledger History
              </div>
              <div id="portal-history-list" style="display: flex; flex-direction: column; gap: 6px;">
                <div style="text-align: center; color: #666; font-size: 12px; padding: 12px;">
                  No ledger transactions recorded yet.
                </div>
              </div>
            </div>
          </div>

          <!-- SUBTAB A: PROFILE -->
          <div id="subtab-view-profile" style="display: none;">
            <form id="portal-profile-form">
              <!-- Avatar Upload / Setting -->
              <div class="avatar-wrapper">
                <div class="avatar-preview" id="profile-avatar-preview">
                  <span id="profile-avatar-text">TS</span>
                </div>
                <div style="flex: 1;">
                  <label style="font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.1em; display: block; margin-bottom: 4px;">Profile Photo</label>
                  <div style="display: flex; gap: 6px;">
                    <input type="text" class="auth-input" id="profile-avatar-url" placeholder="https://... or base64 image" style="font-size: 11px; padding: 6px 10px;">
                    <button type="button" class="auth-secondary-btn" id="save-avatar-btn" style="white-space: nowrap;">Set Avatar</button>
                  </div>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="auth-input-group">
                  <label>First Name</label>
                  <input type="text" class="auth-input" id="prof-firstname" placeholder="Nikola">
                </div>
                <div class="auth-input-group">
                  <label>Last Name</label>
                  <input type="text" class="auth-input" id="prof-lastname" placeholder="Tesla">
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="auth-input-group">
                  <label>Phone Number</label>
                  <input type="text" class="auth-input" id="prof-phone" placeholder="+1 (555) 0199">
                </div>
                <div class="auth-input-group">
                  <label>Country / Region</label>
                  <input type="text" class="auth-input" id="prof-country" placeholder="United States">
                </div>
              </div>

              <div class="auth-input-group">
                <label>Street Address</label>
                <input type="text" class="auth-input" id="prof-address1" placeholder="3500 Deer Creek Road">
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                <div class="auth-input-group">
                  <label>City</label>
                  <input type="text" class="auth-input" id="prof-city" placeholder="Austin">
                </div>
                <div class="auth-input-group">
                  <label>State / Prov</label>
                  <input type="text" class="auth-input" id="prof-state" placeholder="TX">
                </div>
                <div class="auth-input-group">
                  <label>Postal Code</label>
                  <input type="text" class="auth-input" id="prof-zip" placeholder="78725">
                </div>
              </div>

              <div class="auth-input-group">
                <label>Investor Bio / Statement</label>
                <input type="text" class="auth-input" id="prof-bio" placeholder="Sustainable energy investor & technology enthusiast">
              </div>

              <button type="submit" class="auth-submit-btn" id="save-profile-btn">Save Profile Changes</button>
            </form>
          </div>

          <!-- SUBTAB B: SECURITY & ACCOUNT -->
          <div id="subtab-view-security" style="display: none;">
            <form id="portal-security-form">
              <div class="auth-input-group">
                <label>Display Name</label>
                <input type="text" class="auth-input" id="sec-displayname" placeholder="Tesla Shareholder">
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="auth-input-group">
                  <label>Account Language</label>
                  <select class="auth-select" id="sec-language">
                    <option value="en">English (US)</option>
                    <option value="es">Español</option>
                    <option value="de">Deutsch</option>
                    <option value="fr">Français</option>
                    <option value="zh">中文</option>
                    <option value="ja">日本語</option>
                  </select>
                </div>
                <div class="auth-input-group">
                  <label>Timezone</label>
                  <select class="auth-select" id="sec-timezone">
                    <option value="America/New_York">Eastern (EST/EDT)</option>
                    <option value="America/Chicago">Central (CST/CDT)</option>
                    <option value="America/Denver">Mountain (MST/MDT)</option>
                    <option value="America/Los_Angeles">Pacific (PST/PDT)</option>
                    <option value="Europe/London">London (GMT/BST)</option>
                    <option value="Europe/Berlin">Central Europe (CET)</option>
                    <option value="Asia/Tokyo">Tokyo (JST)</option>
                  </select>
                </div>
              </div>

              <div class="toggle-switch-row">
                <div class="toggle-info">
                  <span class="toggle-title">Two-Factor Authentication</span>
                  <span class="toggle-desc">Require secondary authentication challenge on sensitive actions</span>
                </div>
                <input type="checkbox" class="toggle-input" id="sec-2fa">
              </div>

              <div class="toggle-switch-row">
                <div class="toggle-info">
                  <span class="toggle-title">Login Alerts</span>
                  <span class="toggle-desc">Notify via email on new sign-ins from unrecognized browsers</span>
                </div>
                <input type="checkbox" class="toggle-input" id="sec-login-alerts">
              </div>

              <div class="auth-input-group" style="margin-top: 10px;">
                <label>Session Timeout (Inactivity)</label>
                <select class="auth-select" id="sec-session-timeout">
                  <option value="15">15 Minutes</option>
                  <option value="30">30 Minutes</option>
                  <option value="60">60 Minutes (Default)</option>
                  <option value="120">2 Hours</option>
                  <option value="240">4 Hours</option>
                </select>
              </div>

              <button type="submit" class="auth-submit-btn" id="save-security-btn">Update Security Settings</button>
            </form>

            <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 20px 0;">

            <!-- Password Change Form -->
            <form id="portal-password-form">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #888; letter-spacing: 0.1em; margin-bottom: 12px;">Change Password</div>
              <div class="auth-input-group">
                <label>Current Password</label>
                <input type="password" class="auth-input" id="pwd-current" required placeholder="••••••••">
              </div>
              <div class="auth-input-group">
                <label>New Password (Min 8 chars, 1 num, 1 spec)</label>
                <input type="password" class="auth-input" id="pwd-new" required placeholder="••••••••">
              </div>
              <button type="submit" class="auth-secondary-btn" style="width: 100%; padding: 10px;" id="save-password-btn">Update Password</button>
            </form>
          </div>

          <!-- SUBTAB C: NOTIFICATIONS -->
          <div id="subtab-view-notifications" style="display: none;">
            <form id="portal-notifications-form">
              <div class="toggle-switch-row">
                <div class="toggle-info">
                  <span class="toggle-title">Email Notifications</span>
                  <span class="toggle-desc">General account and investment activity emails</span>
                </div>
                <input type="checkbox" class="toggle-input" id="notif-email" checked>
              </div>

              <div class="toggle-switch-row">
                <div class="toggle-info">
                  <span class="toggle-title">Push Notifications</span>
                  <span class="toggle-desc">Browser notifications for critical account alerts</span>
                </div>
                <input type="checkbox" class="toggle-input" id="notif-push" checked>
              </div>

              <div class="toggle-switch-row">
                <div class="toggle-info">
                  <span class="toggle-title">Investment Updates</span>
                  <span class="toggle-desc">Reports on IPO allocation, dividend distributions, and yield</span>
                </div>
                <input type="checkbox" class="toggle-input" id="notif-investment" checked>
              </div>

              <div class="toggle-switch-row">
                <div class="toggle-info">
                  <span class="toggle-title">Price & Yield Alerts</span>
                  <span class="toggle-desc">Alerts when Tesla assets hit specified price targets</span>
                </div>
                <input type="checkbox" class="toggle-input" id="notif-price" checked>
              </div>

              <div class="toggle-switch-row">
                <div class="toggle-info">
                  <span class="toggle-title">Security Alerts</span>
                  <span class="toggle-desc">Immediate alerts on password changes and security updates</span>
                </div>
                <input type="checkbox" class="toggle-input" id="notif-security" checked>
              </div>

              <div class="toggle-switch-row">
                <div class="toggle-info">
                  <span class="toggle-title">Marketing & Investor News</span>
                  <span class="toggle-desc">Occasional quarterly letters and product release announcements</span>
                </div>
                <input type="checkbox" class="toggle-input" id="notif-marketing">
              </div>

              <button type="submit" class="auth-submit-btn" id="save-notifications-btn" style="margin-top: 14px;">Save Notification Preferences</button>
            </form>
          </div>

          <!-- SUBTAB D: PREFERENCES -->
          <div id="subtab-view-preferences" style="display: none;">
            <form id="portal-preferences-form">
              <div class="auth-input-group">
                <label>Interface Theme</label>
                <select class="auth-select" id="pref-theme">
                  <option value="dark">Tesla Cyber Dark (Default)</option>
                  <option value="light">Solar Light</option>
                  <option value="system">Match System</option>
                </select>
              </div>

              <div class="auth-input-group">
                <label>Default Currency</label>
                <select class="auth-select" id="pref-currency">
                  <option value="USD">USD ($) - US Dollar</option>
                  <option value="EUR">EUR (€) - Euro</option>
                  <option value="GBP">GBP (£) - British Pound</option>
                  <option value="CAD">CAD ($) - Canadian Dollar</option>
                  <option value="AUD">AUD ($) - Australian Dollar</option>
                  <option value="JPY">JPY (¥) - Japanese Yen</option>
                  <option value="CHF">CHF (Fr) - Swiss Franc</option>
                </select>
              </div>

              <div class="toggle-switch-row">
                <div class="toggle-info">
                  <span class="toggle-title">Hide Portfolio Balance</span>
                  <span class="toggle-desc">Mask financial balances in UI for privacy in public spaces</span>
                </div>
                <input type="checkbox" class="toggle-input" id="pref-hide-balance">
              </div>

              <div class="toggle-switch-row">
                <div class="toggle-info">
                  <span class="toggle-title">Auto-Invest Enabled</span>
                  <span class="toggle-desc">Automatically reinvest recurring yields and dividends</span>
                </div>
                <input type="checkbox" class="toggle-input" id="pref-autoinvest">
              </div>

              <button type="submit" class="auth-submit-btn" id="save-preferences-btn" style="margin-top: 14px;">Save Display Preferences</button>
            </form>
          </div>

          <!-- SIGN OUT BUTTON -->
          <button type="button" class="auth-secondary-btn" style="width: 100%; margin-top: 18px; color: #ff8080; border-color: rgba(232,33,39,0.3);" id="portal-logout-btn">
            Sign Out of Portal
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(div);

    bindModalEvents();
  }

  function populateProfileForm(profile) {
    if (!profile) return;

    const firstName = profile.firstName || profile.first_name || '';
    const lastName = profile.lastName || profile.last_name || '';
    const email = profile.email || '';
    const initials = (firstName[0] || 'T') + (lastName[0] || 'S');

    // Summary Card
    const nameEl = document.getElementById('profile-summary-name');
    const emailEl = document.getElementById('profile-summary-email');
    const roleEl = document.getElementById('profile-role-badge');
    const emailBadge = document.getElementById('profile-email-badge');
    const topInitials = document.getElementById('top-avatar-initials');
    const avatarText = document.getElementById('profile-avatar-text');
    const avatarContainer = document.getElementById('top-avatar-container');
    const profileAvatarPreview = document.getElementById('profile-avatar-preview');

    if (nameEl) nameEl.textContent = `${firstName} ${lastName}`.trim() || 'Verified Investor';
    if (emailEl) emailEl.textContent = email;
    if (roleEl) roleEl.textContent = `ROLE: ${profile.role || 'USER'}`;
    if (emailBadge) {
      emailBadge.textContent = profile.emailVerified ? '✓ EMAIL VERIFIED' : '⚠ EMAIL UNVERIFIED';
      emailBadge.style.color = profile.emailVerified ? '#86efac' : '#fde047';
    }

    if (profile.avatarUrl) {
      if (topInitials) topInitials.style.display = 'none';
      if (avatarText) avatarText.style.display = 'none';
      if (avatarContainer) avatarContainer.innerHTML = `<img src="${profile.avatarUrl}" alt="Avatar">`;
      if (profileAvatarPreview) profileAvatarPreview.innerHTML = `<img src="${profile.avatarUrl}" alt="Avatar">`;
    } else {
      if (topInitials) {
        topInitials.textContent = initials.toUpperCase();
        topInitials.style.display = 'block';
      }
      if (avatarText) {
        avatarText.textContent = initials.toUpperCase();
        avatarText.style.display = 'block';
      }
    }

    // Input fields
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) el.value = val;
    };

    setVal('prof-firstname', firstName);
    setVal('prof-lastname', lastName);
    setVal('prof-phone', profile.phone || '');
    setVal('prof-country', profile.country || '');
    setVal('prof-address1', profile.addressLine1 || profile.address_line1 || '');
    setVal('prof-city', profile.city || '');
    setVal('prof-state', profile.stateProvince || profile.state_province || '');
    setVal('prof-zip', profile.postalCode || profile.postal_code || '');
    setVal('prof-bio', profile.bio || '');
    setVal('profile-avatar-url', profile.avatarUrl || '');
  }

  function populateSettingsForm(settings) {
    if (!settings) return;

    const account = settings.account || {};
    const security = settings.security || {};
    const notifs = settings.notifications || {};
    const prefs = settings.preferences || {};

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) el.value = val;
    };
    const setChecked = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.checked = Boolean(val);
    };

    // Account & Security
    setVal('sec-displayname', account.displayName || '');
    setVal('sec-language', account.language || 'en');
    setVal('sec-timezone', account.timezone || 'America/New_York');
    setChecked('sec-2fa', security.twoFactorEnabled);
    setChecked('sec-login-alerts', security.loginAlertsEnabled);
    setVal('sec-session-timeout', String(security.sessionTimeoutMinutes || 60));

    // Notifications
    setChecked('notif-email', notifs.emailNotifications);
    setChecked('notif-push', notifs.pushNotifications);
    setChecked('notif-investment', notifs.investmentUpdates);
    setChecked('notif-price', notifs.priceAlerts);
    setChecked('notif-security', notifs.securityAlerts);
    setChecked('notif-marketing', notifs.marketingEmails);

    // Preferences
    setVal('pref-theme', prefs.theme || 'dark');
    setVal('pref-currency', prefs.defaultCurrency || 'USD');
    setChecked('pref-hide-balance', prefs.hidePortfolioBalance);
    setChecked('pref-autoinvest', prefs.autoInvestEnabled);
  }

  function bindModalEvents() {
    const backdrop = document.getElementById('tesla-auth-backdrop');
    const closeBtn = document.getElementById('auth-close-btn');
    const tabLogin = document.getElementById('tab-login-btn');
    const tabReg = document.getElementById('tab-register-btn');
    const gotoForgot = document.getElementById('goto-forgot-link');
    const gotoLogin = document.getElementById('goto-login-link');
    const loginForm = document.getElementById('auth-login-form');
    const regForm = document.getElementById('auth-register-form');
    const forgotForm = document.getElementById('auth-forgot-form');
    const logoutBtn = document.getElementById('portal-logout-btn');

    // Portal Subtabs
    const subtabInvestments = document.getElementById('subtab-investments-btn');
    const subtabProfile = document.getElementById('subtab-profile-btn');
    const subtabSecurity = document.getElementById('subtab-security-btn');
    const subtabNotifs = document.getElementById('subtab-notifs-btn');
    const subtabPrefs = document.getElementById('subtab-prefs-btn');

    // Forms inside portal
    const investmentForm = document.getElementById('portal-investment-form');
    const planSelect = document.getElementById('inv-plan-select');
    const amountInput = document.getElementById('inv-amount-input');
    const profileForm = document.getElementById('portal-profile-form');
    const securityForm = document.getElementById('portal-security-form');
    const notifsForm = document.getElementById('portal-notifications-form');
    const prefsForm = document.getElementById('portal-preferences-form');
    const passwordForm = document.getElementById('portal-password-form');
    const saveAvatarBtn = document.getElementById('save-avatar-btn');

    closeBtn.addEventListener('click', () => closeAuthModal());
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeAuthModal();
    });

    tabLogin.addEventListener('click', () => switchTab('login'));
    tabReg.addEventListener('click', () => switchTab('register'));
    gotoForgot.addEventListener('click', () => switchTab('forgot'));
    gotoLogin.addEventListener('click', () => switchTab('login'));

    if (subtabInvestments) subtabInvestments.addEventListener('click', () => switchPortalSubTab('investments'));
    subtabProfile.addEventListener('click', () => switchPortalSubTab('profile'));
    subtabSecurity.addEventListener('click', () => switchPortalSubTab('security'));
    subtabNotifs.addEventListener('click', () => switchPortalSubTab('notifications'));
    subtabPrefs.addEventListener('click', () => switchPortalSubTab('preferences'));

    if (investmentForm) investmentForm.addEventListener('submit', handleCreateInvestment);
    if (planSelect) planSelect.addEventListener('change', updateCalcPreview);
    if (amountInput) amountInput.addEventListener('input', updateCalcPreview);

    loginForm.addEventListener('submit', handleLogin);
    regForm.addEventListener('submit', handleRegister);
    forgotForm.addEventListener('submit', handleForgotPassword);
    logoutBtn.addEventListener('click', handleLogout);

    profileForm.addEventListener('submit', handleUpdateProfile);
    securityForm.addEventListener('submit', handleUpdateSecurity);
    notifsForm.addEventListener('submit', handleUpdateNotifications);
    prefsForm.addEventListener('submit', handleUpdatePreferences);
    passwordForm.addEventListener('submit', handleChangePassword);
    saveAvatarBtn.addEventListener('click', handleSaveAvatar);
  }

  function switchTab(tab) {
    activeTab = tab;
    const modal = document.getElementById('tesla-auth-modal');
    const tabLogin = document.getElementById('tab-login-btn');
    const tabReg = document.getElementById('tab-register-btn');
    const tabsContainer = document.getElementById('auth-tabs-container');
    const loginForm = document.getElementById('auth-login-form');
    const regForm = document.getElementById('auth-register-form');
    const forgotForm = document.getElementById('auth-forgot-form');
    const profileView = document.getElementById('auth-profile-view');
    const subtitle = document.getElementById('auth-modal-subtitle');
    hideAlert();

    if (modal) {
      if (tab === 'portal' || tab === 'profile' || tab === 'investments') {
        modal.classList.add('portal-mode');
      } else {
        modal.classList.remove('portal-mode');
      }
    }

    if (tab === 'login') {
      tabsContainer.style.display = 'flex';
      tabLogin.classList.add('active');
      tabReg.classList.remove('active');
      loginForm.style.display = 'block';
      regForm.style.display = 'none';
      forgotForm.style.display = 'none';
      profileView.style.display = 'none';
      subtitle.textContent = 'Investor & Shareholder Access';
    } else if (tab === 'register') {
      tabsContainer.style.display = 'flex';
      tabReg.classList.add('active');
      tabLogin.classList.remove('active');
      loginForm.style.display = 'none';
      regForm.style.display = 'block';
      forgotForm.style.display = 'none';
      profileView.style.display = 'none';
      subtitle.textContent = 'Create Verified Investor Account';
    } else if (tab === 'forgot') {
      tabsContainer.style.display = 'none';
      loginForm.style.display = 'none';
      regForm.style.display = 'none';
      forgotForm.style.display = 'block';
      profileView.style.display = 'none';
      subtitle.textContent = 'Password Recovery Procedure';
    } else if (tab === 'portal' || tab === 'profile' || tab === 'investments') {
      tabsContainer.style.display = 'none';
      loginForm.style.display = 'none';
      regForm.style.display = 'none';
      forgotForm.style.display = 'none';
      profileView.style.display = 'block';
      subtitle.textContent = 'Active Authenticated Investor Portal';

      loadInvestmentData();
      loadProfileData();
      loadSettingsData();
    }
  }

  function switchPortalSubTab(subtab) {
    activePortalSubTab = subtab;
    hideAlert();

    const subtabs = ['investments', 'profile', 'security', 'notifications', 'preferences'];
    subtabs.forEach((st) => {
      const btn = document.getElementById(`subtab-${st === 'notifications' ? 'notifs' : (st === 'preferences' ? 'prefs' : st)}-btn`);
      const view = document.getElementById(`subtab-view-${st}`);
      if (btn) {
        if (st === subtab) btn.classList.add('active');
        else btn.classList.remove('active');
      }
      if (view) {
        view.style.display = st === subtab ? 'block' : 'none';
      }
    });

    if (subtab === 'investments') {
      loadInvestmentData();
    }
  }

  async function loadInvestmentData() {
    try {
      // 1. Fetch available plans
      const plansRes = await apiCall(API_PLANS, 'GET');
      if (plansRes.ok && plansRes.data.success && plansRes.data.data.plans) {
        currentPlans = plansRes.data.data.plans;
        populatePlansDropdown(currentPlans);
      }

      // 2. Fetch user investments
      const invRes = await apiCall(API_INVESTMENTS, 'GET');
      if (invRes.ok && invRes.data.success && invRes.data.data.investments) {
        currentInvestments = invRes.data.data.investments;
      }

      // 3. Fetch portfolio summary
      const sumRes = await apiCall(`${API_INVESTMENTS}/summary`, 'GET');
      if (sumRes.ok && sumRes.data.success && sumRes.data.data.summary) {
        currentSummary = sumRes.data.data.summary;
      }

      // 4. Fetch transactions history
      const histRes = await apiCall(`${API_INVESTMENTS}/history`, 'GET');
      if (histRes.ok && histRes.data.success && histRes.data.data.history) {
        currentHistory = histRes.data.data.history;
      }

      renderInvestmentPortalUI();
    } catch (err) {
      console.warn('Error loading investment portal data:', err);
    }
  }

  function populatePlansDropdown(plans) {
    const select = document.getElementById('inv-plan-select');
    if (!select) return;

    if (!plans || plans.length === 0) {
      select.innerHTML = '<option value="">No active offerings currently open</option>';
      return;
    }

    select.innerHTML = plans.map(p => {
      const roiLabel = p.returnType === 'FIXED_YIELD' 
        ? `${p.expectedRoiPercentage}% Annual Yield`
        : (p.returnType === 'PROFIT_SHARE' ? `${p.expectedRoiPercentage}% Target Return` : 'Direct Equity Growth');
      return `<option value="${p.id}" data-price="${p.unitPrice}" data-min="${p.minInvestment}" data-max="${p.maxInvestment || ''}" data-duration="${p.durationMonths}" data-roi="${roiLabel}">
        ${p.name} (${p.ticker || 'TSLA'}) - $${Number(p.unitPrice).toFixed(2)}/unit | Min: $${Number(p.minInvestment).toLocaleString()}
      </option>`;
    }).join('');

    updateCalcPreview();
  }

  function updateCalcPreview() {
    const select = document.getElementById('inv-plan-select');
    const amountInput = document.getElementById('inv-amount-input');
    const previewBox = document.getElementById('inv-calc-preview');
    if (!select || !amountInput || !previewBox) return;

    const selectedOption = select.selectedOptions[0];
    const amountVal = parseFloat(amountInput.value);

    if (!selectedOption || !selectedOption.value) {
      previewBox.style.display = 'none';
      return;
    }

    previewBox.style.display = 'block';
    const unitPrice = parseFloat(selectedOption.getAttribute('data-price') || '0');
    const duration = selectedOption.getAttribute('data-duration') || '0';
    const roi = selectedOption.getAttribute('data-roi') || 'Capital Appreciation';

    const unitPriceEl = document.getElementById('calc-unit-price');
    const unitsEl = document.getElementById('calc-units');
    const durationEl = document.getElementById('calc-duration');
    const roiEl = document.getElementById('calc-roi');

    if (unitPriceEl) unitPriceEl.textContent = `$${unitPrice.toFixed(2)}`;
    if (durationEl) durationEl.textContent = parseInt(duration, 10) > 0 ? `${duration} Months` : 'Open Equity Allocation';
    if (roiEl) roiEl.textContent = roi;

    if (!isNaN(amountVal) && amountVal > 0 && unitPrice > 0) {
      const units = (amountVal / unitPrice).toFixed(6);
      if (unitsEl) unitsEl.textContent = `${units} Units`;
    } else {
      if (unitsEl) unitsEl.textContent = '0.000000 Units';
    }
  }

  function renderInvestmentPortalUI() {
    // 1. Summary Cards
    const totalInvestedEl = document.getElementById('port-total-invested');
    const activeHoldingsEl = document.getElementById('port-active-holdings');
    const projectedReturnsEl = document.getElementById('port-projected-returns');

    if (currentSummary) {
      const totalInvested = Number(currentSummary.totalInvestedAmount || 0);
      const projectedPayout = Number(currentSummary.totalProjectedPayout || totalInvested);
      if (totalInvestedEl) totalInvestedEl.textContent = `$${totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (activeHoldingsEl) activeHoldingsEl.textContent = String(currentSummary.activeCount || 0);
      if (projectedReturnsEl) projectedReturnsEl.textContent = `$${projectedPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // 2. Active Holdings List
    const holdingsContainer = document.getElementById('portal-investments-list');
    if (holdingsContainer) {
      if (!currentInvestments || currentInvestments.length === 0) {
        holdingsContainer.innerHTML = `
          <div style="text-align: center; color: #666; font-size: 12px; padding: 16px;">
            No active investment tranches. Allocate capital above to issue a digital certificate.
          </div>
        `;
      } else {
        holdingsContainer.innerHTML = currentInvestments.map(inv => {
          const formattedAmount = `$${Number(inv.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
          const formattedUnits = Number(inv.units).toFixed(4);
          const startDate = inv.startDate ? new Date(inv.startDate).toLocaleDateString() : 'Active';
          const maturityDate = inv.maturityDate ? new Date(inv.maturityDate).toLocaleDateString() : 'Perpetual Holding';

          return `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 14px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                <div>
                  <div style="font-size: 13px; font-weight: 700; color: #fff;">${inv.planName || 'Tesla Direct Holding'}</div>
                  <div style="font-size: 10px; color: #888; font-family: monospace;">CERT: ${inv.certificateId || 'TSLA-CERT'}</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 14px; font-weight: 700; color: #86efac;">${formattedAmount}</div>
                  <span style="font-size: 9px; font-weight: 600; background: rgba(34,197,94,0.15); color: #86efac; padding: 2px 6px; border-radius: 999px;">${inv.status}</span>
                </div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: #aaa; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 6px; margin-top: 6px;">
                <span>Units: <strong style="color: #fff;">${formattedUnits}</strong></span>
                <span>Maturity: <strong style="color: #fff;">${maturityDate}</strong></span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 3. Transactions History List
    const historyContainer = document.getElementById('portal-history-list');
    if (historyContainer) {
      if (!currentHistory || currentHistory.length === 0) {
        historyContainer.innerHTML = `
          <div style="text-align: center; color: #666; font-size: 12px; padding: 12px;">
            No ledger transactions recorded yet.
          </div>
        `;
      } else {
        historyContainer.innerHTML = currentHistory.slice(0, 10).map(tx => {
          const dateStr = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : '';
          const txAmount = `$${Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

          return `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 8px 12px; font-size: 11px;">
              <div>
                <span style="font-weight: 600; color: #fff;">${tx.type}</span>
                <span style="color: #666; margin-left: 6px; font-family: monospace; font-size: 10px;">${tx.referenceId}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #888; font-size: 10px;">${dateStr}</span>
                <span style="font-weight: 700; color: #86efac;">${txAmount}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  async function handleCreateInvestment(e) {
    e.preventDefault();
    hideAlert();
    const submitBtn = document.getElementById('execute-investment-btn');
    const planId = document.getElementById('inv-plan-select').value;
    const amount = parseFloat(document.getElementById('inv-amount-input').value);
    const paymentMethod = document.getElementById('inv-payment-method').value;

    if (!planId) {
      showAlert('Please select an investment plan.', 'error');
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      showAlert('Please specify a positive investment amount.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Allocating via Atomic Transaction...';

    const idempotencyKey = 'client-inv-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

    try {
      const res = await apiCall(API_INVESTMENTS, 'POST', {
        planId,
        amount,
        paymentMethod,
        idempotencyKey
      });

      if (res.ok && res.data.success) {
        showAlert('Investment allocation successfully executed and recorded!', 'success');
        document.getElementById('inv-amount-input').value = '';
        await loadInvestmentData();
      } else {
        const errorMsg = res.data?.error?.message || 'Investment execution failed.';
        showAlert(errorMsg, 'error');
      }
    } catch (err) {
      showAlert('Network error while processing investment.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm & Execute Allocation';
    }
  }


  function showAlert(msg, type = 'error') {
    const alert = document.getElementById('auth-alert');
    if (!alert) return;
    alert.className = `auth-alert ${type}`;
    alert.textContent = msg;
  }

  function hideAlert() {
    const alert = document.getElementById('auth-alert');
    if (!alert) return;
    alert.className = 'auth-alert';
    alert.textContent = '';
  }

  async function handleLogin(e) {
    e.preventDefault();
    hideAlert();
    const submitBtn = document.getElementById('login-submit-btn');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Authenticating...';

    try {
      const res = await apiCall(`${API_AUTH}/login`, 'POST', { email, password });
      if (res.ok && res.data.success) {
        setStoredToken(res.data.data.token);
        currentUser = res.data.data.user;
        updateNavUserState(currentUser);
        showAlert('Authentication successful. Loading portal...', 'success');
        setTimeout(() => {
          switchTab('portal');
          hideAlert();
        }, 600);
      } else {
        const errorMsg = res.data?.error?.message || 'Login failed. Please check credentials.';
        showAlert(errorMsg, 'error');
      }
    } catch (err) {
      showAlert('Network or server communication error', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Authenticate';
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    hideAlert();
    const submitBtn = document.getElementById('reg-submit-btn');
    const firstName = document.getElementById('reg-firstname').value.trim();
    const lastName = document.getElementById('reg-lastname').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const country = document.getElementById('reg-country').value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Provisioning Account...';

    try {
      const res = await apiCall(`${API_AUTH}/register`, 'POST', {
        firstName,
        lastName,
        email,
        password,
        country
      });

      if (res.ok && res.data.success) {
        setStoredToken(res.data.data.token);
        currentUser = res.data.data.user;
        updateNavUserState(currentUser);
        showAlert('Investor account registered successfully!', 'success');
        setTimeout(() => {
          switchTab('portal');
          hideAlert();
        }, 800);
      } else {
        const errorMsg = res.data?.error?.message || 'Registration failed.';
        showAlert(errorMsg, 'error');
      }
    } catch (err) {
      showAlert('Network or server communication error', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Investor Account';
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    hideAlert();
    const submitBtn = document.getElementById('forgot-submit-btn');
    const email = document.getElementById('forgot-email').value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Dispatching...';

    try {
      const res = await apiCall(`${API_AUTH}/forgot-password`, 'POST', { email });
      if (res.ok && res.data.success) {
        showAlert(res.data.data.message, 'success');
      } else {
        showAlert(res.data?.error?.message || 'Failed to initiate reset', 'error');
      }
    } catch (err) {
      showAlert('Network or server communication error', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Dispatch Reset Link';
    }
  }

  async function handleUpdateProfile(e) {
    e.preventDefault();
    hideAlert();
    const submitBtn = document.getElementById('save-profile-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving Profile...';

    const updates = {
      firstName: document.getElementById('prof-firstname').value.trim(),
      lastName: document.getElementById('prof-lastname').value.trim(),
      phone: document.getElementById('prof-phone').value.trim(),
      country: document.getElementById('prof-country').value.trim(),
      addressLine1: document.getElementById('prof-address1').value.trim(),
      city: document.getElementById('prof-city').value.trim(),
      stateProvince: document.getElementById('prof-state').value.trim(),
      postalCode: document.getElementById('prof-zip').value.trim(),
      bio: document.getElementById('prof-bio').value.trim()
    };

    try {
      const res = await apiCall(API_PROFILE, 'PATCH', updates);
      if (res.ok && res.data.success) {
        currentProfile = res.data.data.profile;
        populateProfileForm(currentProfile);
        updateNavUserState(currentProfile);
        showAlert('Profile updated successfully!', 'success');
      } else {
        showAlert(res.data?.error?.message || 'Failed to update profile', 'error');
      }
    } catch (err) {
      showAlert('Error communicating with server', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Profile Changes';
    }
  }

  async function handleSaveAvatar() {
    hideAlert();
    const input = document.getElementById('profile-avatar-url');
    const avatarVal = input.value.trim();

    if (!avatarVal) {
      showAlert('Please enter an avatar URL or image data URI', 'error');
      return;
    }

    try {
      const res = await apiCall(`${API_PROFILE}/avatar`, 'POST', { avatarUrl: avatarVal });
      if (res.ok && res.data.success) {
        currentProfile = res.data.data.profile;
        populateProfileForm(currentProfile);
        showAlert('Avatar updated successfully!', 'success');
      } else {
        showAlert(res.data?.error?.message || 'Failed to update avatar', 'error');
      }
    } catch (err) {
      showAlert('Error uploading avatar', 'error');
    }
  }

  async function handleUpdateSecurity(e) {
    e.preventDefault();
    hideAlert();
    const submitBtn = document.getElementById('save-security-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving Settings...';

    const updates = {
      account: {
        displayName: document.getElementById('sec-displayname').value.trim(),
        language: document.getElementById('sec-language').value,
        timezone: document.getElementById('sec-timezone').value
      },
      security: {
        twoFactorEnabled: document.getElementById('sec-2fa').checked,
        loginAlertsEnabled: document.getElementById('sec-login-alerts').checked,
        sessionTimeoutMinutes: Number(document.getElementById('sec-session-timeout').value)
      }
    };

    try {
      const res = await apiCall(API_SETTINGS, 'PATCH', updates);
      if (res.ok && res.data.success) {
        currentSettings = res.data.data.settings;
        populateSettingsForm(currentSettings);
        showAlert('Security and account settings updated!', 'success');
      } else {
        showAlert(res.data?.error?.message || 'Failed to update security settings', 'error');
      }
    } catch (err) {
      showAlert('Error updating settings', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Update Security Settings';
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    hideAlert();
    const submitBtn = document.getElementById('save-password-btn');
    const currentPassword = document.getElementById('pwd-current').value;
    const newPassword = document.getElementById('pwd-new').value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating Password...';

    try {
      const res = await apiCall(`${API_AUTH}/change-password`, 'POST', {
        currentPassword,
        newPassword
      });

      if (res.ok && res.data.success) {
        document.getElementById('pwd-current').value = '';
        document.getElementById('pwd-new').value = '';
        showAlert('Password changed successfully!', 'success');
      } else {
        showAlert(res.data?.error?.message || 'Failed to change password', 'error');
      }
    } catch (err) {
      showAlert('Error communicating with server', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Update Password';
    }
  }

  async function handleUpdateNotifications(e) {
    e.preventDefault();
    hideAlert();
    const submitBtn = document.getElementById('save-notifications-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving Preferences...';

    const updates = {
      notifications: {
        emailNotifications: document.getElementById('notif-email').checked,
        pushNotifications: document.getElementById('notif-push').checked,
        investmentUpdates: document.getElementById('notif-investment').checked,
        priceAlerts: document.getElementById('notif-price').checked,
        securityAlerts: document.getElementById('notif-security').checked,
        marketingEmails: document.getElementById('notif-marketing').checked
      }
    };

    try {
      const res = await apiCall(API_SETTINGS, 'PATCH', updates);
      if (res.ok && res.data.success) {
        currentSettings = res.data.data.settings;
        populateSettingsForm(currentSettings);
        showAlert('Notification preferences saved!', 'success');
      } else {
        showAlert(res.data?.error?.message || 'Failed to save notifications', 'error');
      }
    } catch (err) {
      showAlert('Error saving preferences', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Notification Preferences';
    }
  }

  async function handleUpdatePreferences(e) {
    e.preventDefault();
    hideAlert();
    const submitBtn = document.getElementById('save-preferences-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving Preferences...';

    const updates = {
      preferences: {
        theme: document.getElementById('pref-theme').value,
        defaultCurrency: document.getElementById('pref-currency').value,
        hidePortfolioBalance: document.getElementById('pref-hide-balance').checked,
        autoInvestEnabled: document.getElementById('pref-autoinvest').checked
      }
    };

    try {
      const res = await apiCall(API_SETTINGS, 'PATCH', updates);
      if (res.ok && res.data.success) {
        currentSettings = res.data.data.settings;
        populateSettingsForm(currentSettings);
        showAlert('Display & investment preferences saved!', 'success');
      } else {
        showAlert(res.data?.error?.message || 'Failed to save preferences', 'error');
      }
    } catch (err) {
      showAlert('Error saving preferences', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Display Preferences';
    }
  }

  async function handleLogout() {
    try {
      await apiCall(`${API_AUTH}/logout`, 'POST');
    } catch (e) {}

    setStoredToken(null);
    currentUser = null;
    currentProfile = null;
    currentSettings = null;
    updateNavUserState(null);
    closeAuthModal();
  }

  function openAuthModal(tab = 'login') {
    const backdrop = document.getElementById('tesla-auth-backdrop');
    if (backdrop) {
      if (currentUser && tab !== 'forgot') {
        switchTab('portal');
      } else {
        switchTab(tab);
      }
      backdrop.classList.add('active');
    }
  }

  function closeAuthModal() {
    const backdrop = document.getElementById('tesla-auth-backdrop');
    if (backdrop) backdrop.classList.remove('active');
  }

  function updateNavUserState(user) {
    // 1. Update index.html right nav badge
    const rightPill = document.querySelector('.nk-right-pill');
    if (rightPill) {
      if (user) {
        const firstName = user.first_name || user.firstName || 'Account';
        const lastName = user.last_name || user.lastName || 'TS';
        const initials = ((firstName[0] || '') + (lastName[0] || 'TS')).toUpperCase();
        rightPill.innerHTML = `
          <span class="nk-right-icon-circle" style="background:#E82127; color:#fff; font-size:10px; font-weight:bold;">${initials}</span>
          <span class="nk-right-label" style="color: #fff;">${firstName}</span>
        `;
        rightPill.style.cursor = 'pointer';
        rightPill.onclick = () => openAuthModal('portal');
      } else {
        rightPill.innerHTML = `
          <span class="nk-right-icon-circle">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="#fff">
              <circle cx="3" cy="3" r="1.5"/>
              <circle cx="9" cy="3" r="1.5"/>
              <circle cx="3" cy="9" r="1.5"/>
              <circle cx="9" cy="9" r="1.5"/>
            </svg>
          </span>
          <span class="nk-right-label">Investor Portal</span>
        `;
        rightPill.style.cursor = 'pointer';
        rightPill.onclick = () => openAuthModal('login');
      }
    }

    // 2. Update v2.html nav button if present
    const investNavBtn = document.querySelector('nav button.magnetic-btn');
    if (investNavBtn && investNavBtn.querySelector('span')) {
      if (user) {
        const name = user.first_name || user.firstName || 'Account';
        investNavBtn.querySelector('span').textContent = `${name} (Portal)`;
      } else {
        investNavBtn.querySelector('span').textContent = 'Invest Now';
      }
    }
  }

  function bindGlobalTriggers() {
    // Bind all buttons with text or intent "Invest", "Reserve", "Sign In", "Portal"
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, a');
      if (!target) return;

      const text = (target.textContent || '').trim().toLowerCase();
      const id = (target.id || '').toLowerCase();
      if (
        id.includes('begin-investment') ||
        id.includes('invest-btn') ||
        text.includes('begin investment') ||
        text.includes('invest in the ipo') ||
        text.includes('reserve now') ||
        text.includes('invest now') ||
        text.includes('allocate capital') ||
        text.includes('see features')
      ) {
        if (!currentUser) {
          e.preventDefault();
          e.stopPropagation();
          openAuthModal('register');
        } else {
          e.preventDefault();
          e.stopPropagation();
          openAuthModal('portal');
          switchPortalSubTab('investments');
        }
      }
    });

    // Make window.openTeslaAuth accessible
    window.openTeslaAuth = openAuthModal;
  }
})();
