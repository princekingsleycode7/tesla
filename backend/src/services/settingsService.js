const settingsRepository = require('../repositories/settingsRepository');
const auditRepository = require('../repositories/auditRepository');

/**
 * User Settings Business Logic Service
 */
class SettingsService {
  /**
   * Formats raw settings database record into structured categorized JSON response
   */
  formatSettings(record) {
    if (!record) return null;

    return {
      id: record.id,
      userId: record.user_id,
      account: {
        language: record.language || 'en',
        timezone: record.timezone || 'America/New_York',
        displayName: record.display_name || ''
      },
      security: {
        twoFactorEnabled: Boolean(record.two_factor_enabled),
        sessionTimeoutMinutes: Number(record.session_timeout_minutes) || 60,
        loginAlertsEnabled: Boolean(record.login_alerts_enabled)
      },
      notifications: {
        emailNotifications: Boolean(record.email_notifications),
        pushNotifications: Boolean(record.push_notifications),
        investmentUpdates: Boolean(record.investment_updates),
        marketingEmails: Boolean(record.marketing_emails),
        priceAlerts: Boolean(record.price_alerts),
        securityAlerts: Boolean(record.security_alerts)
      },
      preferences: {
        theme: record.theme || 'dark',
        defaultCurrency: record.default_currency || 'USD',
        hidePortfolioBalance: Boolean(record.hide_portfolio_balance),
        autoInvestEnabled: Boolean(record.auto_invest_enabled)
      },
      updatedAt: record.updated_at
    };
  }

  /**
   * Retrieves or creates default settings for authenticated user.
   * @param {string} userId
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async getSettings(userId, client = null) {
    const record = await settingsRepository.getOrCreateByUserId(userId, client);
    return this.formatSettings(record);
  }

  /**
   * Updates user settings across account, security, notifications, and preferences.
   * Supports nested payload structures or flat field keys.
   * @param {string} userId
   * @param {object} updates
   * @param {object} [meta]
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async updateSettings(userId, updates = {}, meta = {}, client = null) {
    const current = await settingsRepository.getOrCreateByUserId(userId, client);

    const dbFields = {};

    // Helper to extract boolean safely
    const parseBool = (val) => {
      if (typeof val === 'boolean') return val;
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    };

    // 1. Account Settings
    const account = updates.account || {};
    if (account.language !== undefined || updates.language !== undefined) {
      const lang = account.language !== undefined ? account.language : updates.language;
      if (typeof lang === 'string' && lang.length <= 10) {
        dbFields.language = lang.trim();
      }
    }
    if (account.timezone !== undefined || updates.timezone !== undefined) {
      const tz = account.timezone !== undefined ? account.timezone : updates.timezone;
      if (typeof tz === 'string' && tz.length <= 50) {
        dbFields.timezone = tz.trim();
      }
    }
    if (account.displayName !== undefined || updates.display_name !== undefined || updates.displayName !== undefined) {
      const name = account.displayName !== undefined ? account.displayName : (updates.display_name !== undefined ? updates.display_name : updates.displayName);
      if (typeof name === 'string') {
        dbFields.display_name = name.trim();
      } else if (name === null) {
        dbFields.display_name = null;
      }
    }

    // 2. Security Settings
    const security = updates.security || {};
    if (security.twoFactorEnabled !== undefined || updates.two_factor_enabled !== undefined || updates.twoFactorEnabled !== undefined) {
      const val = security.twoFactorEnabled !== undefined ? security.twoFactorEnabled : (updates.two_factor_enabled !== undefined ? updates.two_factor_enabled : updates.twoFactorEnabled);
      const parsed = parseBool(val);
      if (parsed !== undefined) dbFields.two_factor_enabled = parsed;
    }
    if (security.sessionTimeoutMinutes !== undefined || updates.session_timeout_minutes !== undefined || updates.sessionTimeoutMinutes !== undefined) {
      const timeout = Number(security.sessionTimeoutMinutes !== undefined ? security.sessionTimeoutMinutes : (updates.session_timeout_minutes !== undefined ? updates.session_timeout_minutes : updates.sessionTimeoutMinutes));
      if (!isNaN(timeout) && timeout >= 5 && timeout <= 1440) {
        dbFields.session_timeout_minutes = Math.floor(timeout);
      } else {
        const error = new Error('Session timeout must be between 5 and 1440 minutes');
        error.code = 'INVALID_SETTING_VALUE';
        error.statusCode = 400;
        throw error;
      }
    }
    if (security.loginAlertsEnabled !== undefined || updates.login_alerts_enabled !== undefined || updates.loginAlertsEnabled !== undefined) {
      const val = security.loginAlertsEnabled !== undefined ? security.loginAlertsEnabled : (updates.login_alerts_enabled !== undefined ? updates.login_alerts_enabled : updates.loginAlertsEnabled);
      const parsed = parseBool(val);
      if (parsed !== undefined) dbFields.login_alerts_enabled = parsed;
    }

    // 3. Notification Settings
    const notifs = updates.notifications || {};
    const notifKeys = [
      ['emailNotifications', 'email_notifications'],
      ['pushNotifications', 'push_notifications'],
      ['investmentUpdates', 'investment_updates'],
      ['marketingEmails', 'marketing_emails'],
      ['priceAlerts', 'price_alerts'],
      ['securityAlerts', 'security_alerts']
    ];

    for (const [camel, snake] of notifKeys) {
      const val = notifs[camel] !== undefined ? notifs[camel] : (updates[snake] !== undefined ? updates[snake] : updates[camel]);
      if (val !== undefined) {
        const parsed = parseBool(val);
        if (parsed !== undefined) dbFields[snake] = parsed;
      }
    }

    // 4. Preferences Settings
    const prefs = updates.preferences || {};
    if (prefs.theme !== undefined || updates.theme !== undefined) {
      const theme = prefs.theme !== undefined ? prefs.theme : updates.theme;
      if (['dark', 'light', 'system'].includes(theme)) {
        dbFields.theme = theme;
      } else {
        const error = new Error("Theme must be one of: 'dark', 'light', 'system'");
        error.code = 'INVALID_THEME';
        error.statusCode = 400;
        throw error;
      }
    }
    if (prefs.defaultCurrency !== undefined || updates.default_currency !== undefined || updates.defaultCurrency !== undefined) {
      const curr = prefs.defaultCurrency !== undefined ? prefs.defaultCurrency : (updates.default_currency !== undefined ? updates.default_currency : updates.defaultCurrency);
      if (typeof curr === 'string' && curr.length <= 10) {
        dbFields.default_currency = curr.trim().toUpperCase();
      }
    }
    if (prefs.hidePortfolioBalance !== undefined || updates.hide_portfolio_balance !== undefined || updates.hidePortfolioBalance !== undefined) {
      const val = prefs.hidePortfolioBalance !== undefined ? prefs.hidePortfolioBalance : (updates.hide_portfolio_balance !== undefined ? updates.hide_portfolio_balance : updates.hidePortfolioBalance);
      const parsed = parseBool(val);
      if (parsed !== undefined) dbFields.hide_portfolio_balance = parsed;
    }
    if (prefs.autoInvestEnabled !== undefined || updates.auto_invest_enabled !== undefined || updates.autoInvestEnabled !== undefined) {
      const val = prefs.autoInvestEnabled !== undefined ? prefs.autoInvestEnabled : (updates.auto_invest_enabled !== undefined ? updates.auto_invest_enabled : updates.autoInvestEnabled);
      const parsed = parseBool(val);
      if (parsed !== undefined) dbFields.auto_invest_enabled = parsed;
    }

    const updatedRecord = await settingsRepository.updateSettings(userId, dbFields, client);

    // Audit log settings change
    await auditRepository.logEvent({
      userId,
      action: 'SETTINGS_UPDATED',
      entityType: 'USER_SETTINGS',
      entityId: current.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      newState: dbFields
    }, client);

    return this.formatSettings(updatedRecord);
  }
}

module.exports = new SettingsService();
