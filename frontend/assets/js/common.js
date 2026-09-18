// ============================================
// COMMON UTILITIES - MedAlert System
// ============================================

const API_BASE = '/api';
const SOCKET_URL = window.location.origin;

// ============================================
// TOKEN & USER MANAGEMENT
// ============================================
const Auth = {
  setToken(token) {
    localStorage.setItem('med_token', token);
  },

  getToken() {
    return localStorage.getItem('med_token');
  },

  setUser(user) {
    localStorage.setItem('med_user', JSON.stringify(user));
  },

  getUser() {
    const u = localStorage.getItem('med_user');
    return u ? JSON.parse(u) : null;
  },

  clear() {
    localStorage.removeItem('med_token');
    localStorage.removeItem('med_user');
  },

  isLoggedIn() {
    return !!this.getToken();
  }
};

// ============================================
// API HELPER
// ============================================
const API = {
  async request(method, endpoint, body = null, isFormData = false) {
    const headers = {};
    const token = Auth.getToken();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!isFormData && body) {
      headers['Content-Type'] = 'application/json';
    }

    const config = {
      method,
      headers
    };

    if (body) {
      config.body = isFormData ? body : JSON.stringify(body);
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, config);
      const data = await response.json();
      return {
        ok: response.ok,
        status: response.status,
        data
      };
    } catch (error) {
      console.error('API Error:', error);
      return {
        ok: false,
        status: 0,
        data: {
          success: false,
          message: 'Network error. Is the server running on port 3000?'
        }
      };
    }
  },

  get(endpoint) {
    return this.request('GET', endpoint);
  },

  post(endpoint, body) {
    return this.request('POST', endpoint, body);
  },

  put(endpoint, body) {
    return this.request('PUT', endpoint, body);
  },

  delete(endpoint) {
    return this.request('DELETE', endpoint);
  },

  postForm(endpoint, formData) {
    return this.request('POST', endpoint, formData, true);
  }
};

// ============================================
// BUTTON LOADING STATE
// ============================================
function showLoading(btnEl, text = 'Loading...') {
  if (!btnEl) return;
  btnEl._originalText = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = `<span class="spinner"></span> ${text}`;
}

function hideLoading(btnEl) {
  if (!btnEl) return;
  btnEl.disabled = false;
  btnEl.innerHTML = btnEl._originalText || 'Submit';
}

// ============================================
// ALERT MESSAGES
// ============================================
function showAlert(containerId, message, type = 'error') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const icons = {
    error: '⚠️',
    success: '✅',
    warning: '🔔',
    info: 'ℹ️'
  };

  container.innerHTML = `
    <div class="alert alert-${type}">
      <span>${icons[type] || '⚠️'}</span>
      <span>${message}</span>
    </div>
  `;

  // Auto clear after 5 seconds
  setTimeout(() => {
    if (container) container.innerHTML = '';
  }, 5000);
}

// ============================================
// NOTIFICATION BANNER (top slide down)
// ============================================
function showNotification(message, duration = 3000) {
  // Remove existing banner if any
  let banner = document.getElementById('global-notification-banner');

  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'global-notification-banner';
    banner.className = 'notification-banner';
    document.body.prepend(banner);
  }

  banner.textContent = message;
  banner.classList.add('show');

  setTimeout(() => {
    banner.classList.remove('show');
  }, duration);
}

// ============================================
// CONDITION LABEL HELPER
// ============================================
function getConditionLabel(condition) {
  const labels = {
    high_bp: '🔴 High Blood Pressure',
    low_bp: '🔵 Low Blood Pressure',
    cardiac_emergency: '❤️ Cardiac Emergency',
    no_pulse: '💀 No Pulse Detected',
    getting_low_pulse: '⚠️ Getting Low Pulse'
  };
  return labels[condition] || condition;
}

// ============================================
// LOGOUT
// ============================================
function logout(redirectTo = '../customer/login.html') {
  Auth.clear();
  window.location.href = redirectTo;
}

// ============================================
// DATE & TIME FORMATTERS
// ============================================
function formatTime(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '--';
  return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
}

// ============================================
// AUDIO ALERT (browser beep)
// ============================================
function playBeep(frequency = 880, duration = 0.3, volume = 0.4) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + duration
    );

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    console.log('Audio playback not supported:', e.message);
  }
}

function playEmergencyBeep() {
  // Three quick beeps for emergency
  playBeep(880, 0.2, 0.5);
  setTimeout(() => playBeep(660, 0.2, 0.5), 300);
  setTimeout(() => playBeep(880, 0.2, 0.5), 600);
}

function playSuccessBeep() {
  playBeep(660, 0.15, 0.3);
  setTimeout(() => playBeep(880, 0.2, 0.3), 200);
}

// ============================================
// CONFIRM DIALOG HELPER
// ============================================
function confirmAction(message) {
  return window.confirm(message);
}

// ============================================
// COPY TO CLIPBOARD
// ============================================
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showNotification('Copied to clipboard!', 2000);
  } catch (e) {
    console.log('Clipboard not supported');
  }
}

// ============================================
// DEBOUNCE HELPER
// ============================================
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============================================
// CHECK SESSION TIMEOUT
// ============================================
function checkAuthAndRedirect(expectedRole, loginPage) {
  if (!Auth.isLoggedIn()) {
    window.location.href = loginPage;
    return false;
  }
  const user = Auth.getUser();
  if (!user || user.role !== expectedRole) {
    Auth.clear();
    window.location.href = loginPage;
    return false;
  }
  return true;
}