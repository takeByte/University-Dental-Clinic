/* =========================================================================
   University Dental Clinic - Production Web Application
   Frontend Single Page Application (SPA)
   ========================================================================= */

// State Management
const STATE = {
  token: localStorage.getItem('clinic_token') || null,
  user: null, // { id, username, name, role, campus_id, campus_name, patient_id }
  route: 'home',
  params: {},
  tabs: {},
  brush: 'decayed',
  draftExam: null,
  book: { date: null, time: null, reschedId: null, reason: '' },
  search: { patients: '', ptype: 'all' },
  rf: { month: new Date().toISOString().slice(0, 7), campus: 'all', stage: 'all', op: 'visits', type: 'all' }
};
const savedThemePreference = localStorage.getItem('clinic_theme');
let themePreference = ['light', 'dark', 'system'].includes(savedThemePreference) ? savedThemePreference : 'system';
let renderVersion = 0;

function isDarkTheme() {
  return document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function applyTheme() {
  if (themePreference === 'dark' || themePreference === 'light') {
    document.documentElement.dataset.theme = themePreference;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function themeToggleMarkup() {
  const dark = isDarkTheme();
  const target = dark ? 'light' : 'dark';
  return `<button type="button" class="btn sm theme-toggle" onclick="toggleTheme()" aria-label="Switch to ${target} mode" aria-pressed="${dark}" title="Switch to ${target} mode">${ic(dark ? 'sun' : 'moon')}<span>${dark ? 'Light mode' : 'Dark mode'}</span></button>`;
}

function toggleTheme() {
  themePreference = isDarkTheme() ? 'light' : 'dark';
  localStorage.setItem('clinic_theme', themePreference);
  applyTheme();
  document.querySelectorAll('.theme-toggle').forEach(button => {
    const dark = isDarkTheme();
    const target = dark ? 'light' : 'dark';
    button.setAttribute('aria-label', `Switch to ${target} mode`);
    button.setAttribute('aria-pressed', String(dark));
    button.title = `Switch to ${target} mode`;
    button.innerHTML = `${ic(dark ? 'sun' : 'moon')}<span>${dark ? 'Light mode' : 'Dark mode'}</span>`;
  });
}

function getApiBase() {
  // If served directly from Express on port 3000, use relative paths
  if (window.location.protocol === 'http:' && (
    window.location.port === '3000' ||
    document.getElementById('__bs_script__')
  )) {
    return '';
  }
  // If served from VS Code Live Server (port 5500, etc.) or file://, target Express on localhost:3000
  return 'http://localhost:3000';
}

// API Helper
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (STATE.token) headers['Authorization'] = `Bearer ${STATE.token}`;

  const base = getApiBase();
  const url = path.startsWith('http') ? path : `${base}${path}`;

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && STATE.token) {
      // Token expired or invalid
      logout();
      toast('Session expired. Please log in again.', true);
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      throw new Error(data.error || `HTTP error ${res.status}`);
    }
    return data;
  } catch (err) {
    console.error(`API Error on ${url}:`, err);
    if (err.name === 'TypeError' && (err.message.includes('fetch') || err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
      throw new Error('Unable to connect to the backend server. Please make sure the server is running on port 3000 (npm start).');
    }
    throw err;
  }
}

// Helpers
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
const checked = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(e => e.value);

function fmtDate(s, long) {
  if (!s) return '-';
  const parts = s.split('-');
  if (parts.length < 3) return s;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return (long ? days[d.getDay()] + ', ' : '') + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function fmtTime(t) {
  if (!t) return '-';
  const parts = t.split(':');
  const h = Number(parts[0]);
  const m = parts[1] || '00';
  return (((h + 11) % 12) + 1) + ':' + m + ' ' + (h >= 12 ? 'PM' : 'AM');
}

function ymLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-').map(Number);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return months[mo - 1] + ' ' + y;
}

// UI Notification Toasts
function toast(msg, bad = false) {
  const root = document.getElementById('toasts');
  if (!root) return;
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

// Modal dialogs
function modal(title, bodyHtml, footerHtml, wide = false) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'mback';
  back.id = 'mroot';
  back.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header>
        <h2>${esc(title)}</h2>
      </header>
      <div class="body">${bodyHtml}</div>
      ${footerHtml ? `<footer>${footerHtml}</footer>` : ''}
    </div>
  `;
  back.addEventListener('mousedown', e => { if (e.target === back) closeModal(); });
  document.body.appendChild(back);
  const first = back.querySelector('input:not([type=checkbox]),select,textarea,button.pri');
  if (first) first.focus();
}

function closeModal() {
  const m = document.getElementById('mroot');
  if (m) m.remove();
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function confirmBox(title, msg, okLabel, onOk, danger = false) {
  window._confirmOk = () => { closeModal(); onOk(); };
  modal(title, `<p>${msg}</p>`, `
    <button class="btn" onclick="closeModal()">Cancel</button>
    <button class="btn ${danger ? 'danger' : 'pri'}" onclick="_confirmOk()">${esc(okLabel)}</button>
  `);
}

// Icons
const ICON = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6M16 4.5a3.5 3.5 0 0 1 0 7M22 20c0-2.6-1.8-4.8-4.5-5.6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l8 4V6L7 10H4a1 1 0 0 0-1 1zM18 9a4 4 0 0 1 0 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  tooth: '<path d="M7 3C4.5 3 3 5 3 7.5c0 2 1 3 1.5 5S5 21 7 21c1.5 0 1.5-4 3-4h4c1.5 0 1.5 4 3 4 2 0 1.5-6 2.5-8.5S21 9.5 21 7.5C21 5 19.5 3 17 3c-2 0-2.5 1-5 1S9 3 7 3z"/>',
  clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.700l1-1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  logout: '<path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M16 17l5-5-5-5M21 12H9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>'
};
const ic = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ''}</svg>`;

// Status pill helpers
function apptPill(s) {
  const map = { Pending: 'warn', Approved: 'ok', Declined: 'bad', Cancelled: '', Completed: 'info' };
  return `<span class="pill ${map[s] || ''}">${esc(s)}</span>`;
}
function typePill(t) {
  if (t === 'student') return `<span class="pill student">Student</span>`;
  if (t === 'faculty') return `<span class="pill personnel">Faculty</span>`;
  if (t === 'personnel') return `<span class="pill personnel">Personnel</span>`;
  return `<span class="pill">${esc(t)}</span>`;
}
function sourcePill(s) {
  if (s === 'Emergency Walk-in') return `<span class="pill emergency source-pill">Emergency Walk-in</span>`;
  if (s === 'Appointment') return `<span class="pill pri source-pill">Appointment</span>`;
  return `<span class="pill info source-pill">Walk-in</span>`;
}
function refPill(s) {
  const map = {
    Referred: 'ref-referred',
    Contacted: 'ref-contacted',
    Availed: 'ref-availed',
    Completed: 'ref-completed',
    Pending: 'ref-pending'
  };
  return `<span class="pill ${map[s] || ''}">${esc(s)}</span>`;
}
function stageBar(r) {
  const stages = { Referred: 1, Contacted: 2, Availed: 3, Pending: 3, Completed: 4 };
  const statusClasses = {
    Referred: 'referred',
    Contacted: 'contacted',
    Availed: 'availed',
    Completed: 'completed',
    Pending: 'pending'
  };
  const stage = stages[r.status] || 1;
  const statusClass = statusClasses[r.status] || 'referred';
  return `<div class="stagebar ref-stage-${statusClass}" title="${esc(r.status)}">${[1, 2, 3, 4].map(i => `<i class="${i <= stage ? 'on' : ''}"></i>`).join('')}</div>`;
}

// Routing & Navigation
function go(route, params = {}) {
  closeModal();
  STATE.route = route;
  STATE.params = params;
  render();
}

function setTab(k, v) {
  STATE.tabs[k] = v;
  render();
}
function getTab(k, def) {
  return STATE.tabs[k] || def;
}

/* =========================================================================
   AUTHENTICATION LOGIC
   ========================================================================= */

async function login(username, password) {
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    STATE.token = data.token;
    STATE.user = data.user;
    localStorage.setItem('clinic_token', data.token);
    toast(`Welcome, ${data.user.name}`);
    STATE.route = 'home';
    render();
  } catch (err) {
    toast(err.message || 'Login failed', true);
  }
}

async function logout() {
  try {
    if (STATE.token) {
      await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    }
  } finally {
    STATE.token = null;
    STATE.user = null;
    localStorage.removeItem('clinic_token');
    toast('Logged out');
    render();
  }
}

function fillDemo(username, password) {
  const u = document.getElementById('login_user');
  const p = document.getElementById('login_pass');
  if (u && p) {
    u.value = username;
    p.value = password;
  }
}

/* =========================================================================
   AUTH SCREENS (LOGIN & REGISTER)
   ========================================================================= */

function renderAuth() {
  const isRegister = STATE.route === 'register';

  if (isRegister) {
    return `
      <div class="auth-wrap">
        ${themeToggleMarkup()}
        <div class="auth-box" style="max-width: 620px;">
          <div class="auth-header">
            <div class="mark">${ic('tooth')}</div>
            <h1>New Patient Registration</h1>
            <p>Create your university dental clinic account</p>
          </div>
          <form class="form" onsubmit="handleRegister(event)">
            <div class="fgrid">
              <div class="field"><label>First Name *</label><input type="text" id="reg_first" required></div>
              <div class="field"><label>Last Name *</label><input type="text" id="reg_last" required></div>
              <div class="field"><label>I am a *</label>
                <select class="in" id="reg_type" required>
                  <option value="student">Student</option>
                  <option value="faculty">Faculty</option>
                  <option value="personnel">Personnel</option>
                </select>
              </div>
              <div class="field"><label>Campus *</label>
                <select class="in" id="reg_campus" required>
                  <option value="main">Main Campus</option>
                  <option value="sa">Satellite Campus A</option>
                  <option value="sb">Satellite Campus B</option>
                </select>
              </div>
              <div class="field"><label>ID Number *</label><input type="text" id="reg_id" placeholder="e.g. 2024-01234" required></div>
              <div class="field"><label>Program / Office *</label><input type="text" id="reg_unit" placeholder="e.g. BS Nursing" required></div>
              <div class="field"><label>Year Level / Position</label><input type="text" id="reg_level" placeholder="e.g. 2nd year"></div>
              <div class="field"><label>Mobile Phone</label><input type="tel" id="reg_phone" placeholder="0917 000 0000"></div>
              <div class="field full"><label>Email Address (used for login & alerts) *</label><input type="email" id="reg_email" required></div>
              <div class="field full"><label>Password (at least 6 characters) *</label><input type="password" id="reg_pass" minlength="6" required></div>
            </div>
            <div class="field full" style="margin-top:10px">
              <label style="display:flex;gap:8px;align-items:flex-start;font-weight:500;font-size:13px">
                <input type="checkbox" required style="margin-top:3px">
                I agree that the clinic may keep my dental records and personal health details for clinical use.
              </label>
            </div>
            <div class="actions" style="margin-top: 14px;">
              <button type="submit" class="btn pri" style="flex:1">Register Account</button>
              <button type="button" class="btn" onclick="go('login')">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  return `
    <div class="auth-wrap">
      ${themeToggleMarkup()}
      <div class="auth-box">
        <div class="auth-header">
          <div class="mark">${ic('tooth')}</div>
          <h1>University Dental Clinic</h1>
          <p>Sign in to manage appointments, records, and clinical care</p>
        </div>
        <form class="form" onsubmit="handleLogin(event)">
          <div class="field">
            <label for="login_user">Username or Email</label>
            <input type="text" id="login_user" placeholder="e.g. ana.villanueva or maria.santos@univ.example" required autofocus>
          </div>
          <div class="field">
            <label for="login_pass">Password</label>
            <input type="password" id="login_pass" placeholder="••••••••" required>
          </div>
          <div class="actions" style="margin-top: 10px;">
            <button type="submit" class="btn pri" style="width: 100%;">Sign In</button>
          </div>
        </form>
        <div style="text-align:center;margin-top:14px;font-size:13px">
          Don't have an account? <a href="#" onclick="event.preventDefault();go('register')">Register as new patient</a>
        </div>
        <div class="demo-users">
          <h4>Demo Quick-Fill Accounts</h4>
          <div class="demo-grid">
            <button type="button" class="demo-btn" onclick="fillDemo('ana.villanueva','password123')">
              <div><b>Ana Villanueva</b><span>Clinic Staff (Main Campus)</span></div>
              <span class="pill pri">Staff</span>
            </button>
            <button type="button" class="demo-btn" onclick="fillDemo('liza.ramos','password123')">
              <div><b>Liza Ramos</b><span>Clinic Staff (Satellite Campus A)</span></div>
              <span class="pill pri">Staff</span>
            </button>
            <button type="button" class="demo-btn" onclick="fillDemo('ramon.cruz','password123')">
              <div><b>Dr. Ramon Cruz</b><span>Dentist (Main Campus)</span></div>
              <span class="pill info">Dentist</span>
            </button>
            <button type="button" class="demo-btn" onclick="fillDemo('maria.santos@univ.example','password123')">
              <div><b>Maria Santos</b><span>Patient (Student, Main Campus)</span></div>
              <span class="pill ok">Patient</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function handleLogin(e) {
  e.preventDefault();
  const u = val('login_user');
  const p = val('login_pass');
  if (!u || !p) return;
  await login(u, p);
}

async function handleRegister(e) {
  e.preventDefault();
  const payload = {
    first_name: val('reg_first'),
    last_name: val('reg_last'),
    type: val('reg_type'),
    campus_id: val('reg_campus'),
    id_no: val('reg_id'),
    unit: val('reg_unit'),
    level: val('reg_level'),
    phone: val('reg_phone'),
    email: val('reg_email'),
    password: val('reg_pass')
  };
  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    STATE.token = data.token;
    STATE.user = data.user;
    localStorage.setItem('clinic_token', data.token);
    toast('Account registered and signed in!');
    STATE.route = 'home';
    render();
  } catch (err) {
    toast(err.message || 'Registration failed', true);
  }
}

/* =========================================================================
   ROLE NAVIGATION
   ========================================================================= */

function navFor(user) {
  if (!user) return [];
  if (user.role === 'patient') {
    return [
      ['home', 'My Dashboard', 'home'],
      ['appointments', 'My Appointments', 'calendar'],
      ['records', 'My Records', 'file'],
      ['services', 'Dental Services', 'tooth'],
      ['announcements', 'Announcements', 'megaphone'],
      ['notifications', 'Alerts', 'bell']
    ];
  }
  if (user.role === 'dentist') {
    return [
      ['home', 'Clinical Dashboard', 'home'],
      { grp: 'Clinical Care' },
      ['appointments', 'Appointments', 'calendar'],
      ['patients', 'Patients', 'users'],
      ['visits', 'Visits', 'clip'],
      ['referrals', 'Referrals', 'link'],
      { grp: 'Reports & Analytics' },
      ['reports', 'Reports & Charts', 'chart']
    ];
  }
  // Staff
  const list = [
    ['home', 'Dashboard', 'home'],
    { grp: 'Clinic Operations' },
    ['appointments', 'Appointments', 'calendar'],
    ['patients', 'Patients', 'users'],
    ['visits', 'Visits', 'clip'],
    ['referrals', 'Referrals', 'link'],
    { grp: 'Reports & Posts' },
    ['reports', 'Reports', 'chart'],
    ['announcements', 'Announcements', 'megaphone']
  ];
  if (user.role === 'staff' && user.campus_id === 'main') {
    list.push(['setup', 'Accounts & Setup', 'gear']);
  }
  return list;
}

/* =========================================================================
   PATIENT VIEWS
   ========================================================================= */

async function viewPatientHome() {
  const [apptsData, annData, notifsData, meData] = await Promise.all([
    api('/api/appointments'),
    api('/api/announcements'),
    api('/api/notifications'),
    api(`/api/patients/${STATE.user.patient_id}`)
  ]);

  const appts = apptsData.appointments || [];
  const next = appts.filter(a => (a.status === 'Pending' || a.status === 'Approved') && a.date >= new Date().toISOString().slice(0, 10))
                    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const anns = (annData.announcements || []).slice(0, 3);
  const notifs = (notifsData.notifications || []).slice(0, 3);
  const history = meData.history;

  return `
    <div class="phead">
      <div>
        <h1>Welcome, ${esc(STATE.user.name.split(' ')[0])}</h1>
        <p>${esc(STATE.user.campus_name)} &bull; Book appointments, review dental history, and view clinic announcements.</p>
      </div>
      <div class="actions">
        <button class="btn pri" onclick="openBookModal()">Book Appointment</button>
      </div>
    </div>

    <div class="grid g21">
      <div class="card">
        <h2>Your Next Appointment</h2>
        ${next ? `
          <div class="item" style="border:0;padding:0">
            <div>
              <div class="t" style="font-size:18px;margin-bottom:4px">${fmtDate(next.date, true)} at ${fmtTime(next.time)}</div>
              <div class="s">${esc(next.campus_name)} &bull; Reason: ${esc(next.reason || 'General checkup')}</div>
            </div>
            <div>${apptPill(next.status)}</div>
          </div>
          <div class="actions" style="margin-top:16px">
            <button class="btn sm" onclick="go('appointments')">Manage Appointments</button>
          </div>
        ` : `
          <div class="empty">
            No upcoming appointments scheduled.
            <div style="margin-top:12px"><button class="btn pri sm" onclick="openBookModal()">Book Appointment Now</button></div>
          </div>
        `}
      </div>

      <div class="card">
        <h2>Dental History Status</h2>
        <p class="sub">Last updated: ${fmtDate(history ? history.updated_at : null)}</p>
        <div style="margin:12px 0">
          ${history && history.reviewed ? '<span class="pill ok">Reviewed by dentist</span>' : '<span class="pill warn">Awaiting dentist review</span>'}
        </div>
        <button class="btn sm" onclick="go('records')">View / Update Questionnaire</button>
      </div>
    </div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card">
        <h2>Recent Announcements</h2>
        ${anns.length ? anns.map(a => `
          <div class="item">
            <div>
              <div class="t">${esc(a.title)}</div>
              <div class="s">${fmtDate(a.date)} &bull; ${esc(a.by_name)}</div>
            </div>
          </div>
        `).join('') : '<div class="empty">No announcements posted yet.</div>'}
        <button class="btn sm" style="margin-top:12px" onclick="go('announcements')">View All</button>
      </div>

      <div class="card">
        <h2>Alerts & Notifications</h2>
        ${notifs.length ? notifs.map(n => `
          <div class="item">
            <div>
              <div class="t">${esc(n.text)}</div>
              <div class="s">${fmtDate(n.date)}</div>
            </div>
          </div>
        `).join('') : '<div class="empty">No recent alerts.</div>'}
        <button class="btn sm" style="margin-top:12px" onclick="go('notifications')">View All</button>
      </div>
    </div>
  `;
}

async function viewPatientAppointments() {
  const data = await api('/api/appointments');
  const list = data.appointments || [];

  return `
    <div class="phead">
      <div>
        <h1>My Appointments</h1>
        <p>View your scheduled clinic bookings, reschedule, or cancel requests.</p>
      </div>
      <div class="actions">
        <button class="btn pri" onclick="openBookModal()">Book an Appointment</button>
      </div>
    </div>

    <div class="card">
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Campus</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.length ? list.map(a => {
              const canModify = (a.status === 'Pending' || a.status === 'Approved');
              return `
                <tr>
                  <td><b>${fmtDate(a.date, true)}</b></td>
                  <td>${fmtTime(a.time)}</td>
                  <td>${esc(a.campus_name)}</td>
                  <td>${esc(a.reason || '-')}</td>
                  <td>${apptPill(a.status)}</td>
                  <td>
                    ${canModify ? `
                      <div class="actions">
                        <button class="btn sm" onclick="openBookModal('${a.id}','${a.date}','${a.time}','${esc(a.reason || '')}')">Reschedule</button>
                        <button class="btn sm danger" onclick="cancelAppointment('${a.id}')">Cancel</button>
                      </div>
                    ` : '<span class="muted small">—</span>'}
                  </td>
                </tr>
              `;
            }).join('') : `<tr><td colspan="6" class="empty">No appointments found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function openBookModal(reschedId = null, curDate = '', curTime = '', curReason = '') {
  const slotsData = await api(`/api/appointments/slots?campus=${STATE.user.campus_id}`);
  const closed = slotsData.closed || [];
  const taken = slotsData.taken || [];

  const times = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00'];
  // Generate next 10 weekdays
  const days = [];
  let d = new Date();
  while (days.length < 10) {
    d.setDate(d.getDate() + 1);
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(d.toISOString().slice(0, 10));
    }
  }

  const selectedDate = curDate || days[0];

  const html = `
    <form class="form" onsubmit="handleBookSubmit(event, '${reschedId || ''}')">
      <div class="field">
        <label>1. Select Date</label>
        <select class="in" id="bk_date" onchange="updateSlotGrid()" required>
          ${days.map(dStr => `<option value="${dStr}" ${dStr === selectedDate ? 'selected' : ''}>${fmtDate(dStr, true)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label>2. Select Time Slot</label>
        <div id="slot_chips" class="chips"></div>
        <input type="hidden" id="bk_time" value="${curTime || ''}" required>
      </div>

      <div class="field">
        <label>3. Reason for Visit (Optional)</label>
        <input type="text" id="bk_reason" placeholder="e.g. Toothache, cleaning, filling" value="${curReason}">
      </div>

      <div class="actions" style="margin-top:14px">
        <button type="button" class="btn" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn pri">${reschedId ? 'Confirm Reschedule' : 'Request Appointment'}</button>
      </div>
    </form>
  `;

  modal(reschedId ? 'Reschedule Appointment' : 'Book Dental Appointment', html);

  window._closedSlots = closed;
  window._takenSlots = taken;
  window._reschedId = reschedId;
  updateSlotGrid(curTime);
}

function updateSlotGrid(preselectedTime = null) {
  const date = val('bk_date');
  const container = document.getElementById('slot_chips');
  const timeInput = document.getElementById('bk_time');
  if (!container || !date) return;

  const times = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00'];
  const closed = window._closedSlots || [];
  const taken = window._takenSlots || [];

  container.innerHTML = times.map(t => {
    const isClosed = closed.some(c => c.date === date && c.time === t);
    const isTaken = taken.some(k => k.date === date && k.time === t);
    const unavailable = isClosed || isTaken;
    const isSel = (timeInput.value === t) || (preselectedTime === t);

    return `
      <button type="button" class="chip ${isSel ? 'on' : ''} ${unavailable ? 'closed' : ''}"
        ${unavailable ? 'disabled' : ''}
        onclick="selectSlotTime('${t}')"
        title="${isClosed ? 'Closed by clinic' : isTaken ? 'Already booked' : 'Open'}">
        ${fmtTime(t)}
      </button>
    `;
  }).join('');
}

function selectSlotTime(t) {
  const timeInput = document.getElementById('bk_time');
  if (timeInput) timeInput.value = t;
  updateSlotGrid(t);
}

async function handleBookSubmit(e, reschedId) {
  e.preventDefault();
  const date = val('bk_date');
  const time = val('bk_time');
  const reason = val('bk_reason');

  if (!date || !time) {
    toast('Please select a date and an open time slot.', true);
    return;
  }

  try {
    if (reschedId) {
      await api(`/api/appointments/${reschedId}/reschedule`, {
        method: 'PUT',
        body: JSON.stringify({ date, time, reason })
      });
      toast('Appointment rescheduled successfully.');
    } else {
      await api('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({ date, time, reason })
      });
      toast('Appointment requested. Awaiting clinic staff approval.');
    }
    closeModal();
    render();
  } catch (err) {
    toast(err.message || 'Booking failed', true);
  }
}

async function cancelAppointment(id) {
  confirmBox('Cancel Appointment', 'Are you sure you want to cancel this appointment?', 'Yes, Cancel', async () => {
    try {
      await api(`/api/appointments/${id}`, { method: 'DELETE' });
      toast('Appointment cancelled.');
      render();
    } catch (err) {
      toast(err.message || 'Error cancelling appointment', true);
    }
  }, true);
}

async function viewPatientRecords() {
  const data = await api(`/api/patients/${STATE.user.patient_id}`);
  const p = data.patient;
  const h = data.history || { conditions: [], allergies: 'None', medications: 'None', past_treatment: [] };
  const latestExam = (data.exams || [])[0];

  const condOpts = ['Asthma','Diabetes','High blood pressure','Heart condition','Bleeding problems','Hepatitis','Kidney disease'];
  const pastOpts = ['Cleaning','Filling','Extraction','Root canal','Braces','Gum treatment'];

  return `
    <div class="phead">
      <div>
        <h1>My Dental & Health Records</h1>
        <p>Keep your health history updated so your dentist can provide safe care.</p>
      </div>
    </div>

    <div class="grid g21">
      <div class="card">
        <h2>Dental History Questionnaire</h2>
        <p class="sub">Your dentist reviews changes to this record prior to treatment.</p>
        <form class="form" onsubmit="handleSaveHistory(event)">
          <div class="field">
            <span class="lbl">Medical Conditions</span>
            <div class="checks">
              ${condOpts.map(c => `
                <label>
                  <input type="checkbox" name="pat_cond" value="${esc(c)}" ${(h.conditions || []).includes(c) ? 'checked' : ''}>
                  ${esc(c)}
                </label>
              `).join('')}
            </div>
          </div>

          <div class="field">
            <label>Known Drug / Material Allergies</label>
            <input type="text" id="pat_all" value="${esc(h.allergies === 'None' ? '' : h.allergies)}" placeholder="e.g. Penicillin, Latex, Aspirin (or None)">
          </div>

          <div class="field">
            <label>Current Medications</label>
            <input type="text" id="pat_med" value="${esc(h.medications === 'None' ? '' : h.medications)}" placeholder="e.g. Losartan 50mg daily (or None)">
          </div>

          <div class="field">
            <span class="lbl">Past Dental Treatments</span>
            <div class="checks">
              ${pastOpts.map(t => `
                <label>
                  <input type="checkbox" name="pat_past" value="${esc(t)}" ${(h.past_treatment || []).includes(t) ? 'checked' : ''}>
                  ${esc(t)}
                </label>
              `).join('')}
            </div>
          </div>

          <div class="actions" style="margin-top:14px">
            <button type="submit" class="btn pri">Save Changes</button>
            <span class="muted small" style="margin-left:8px">
              ${h.reviewed ? '<span class="pill ok">Reviewed by dentist</span>' : '<span class="pill warn">Awaiting review</span>'}
            </span>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>Oral Health Summary</h2>
        ${latestExam ? `
          <dl class="kv">
            <dt>Last Exam Date</dt><dd>${fmtDate(latestExam.date)}</dd>
            <dt>Recorded By</dt><dd>${esc(latestExam.by_name)}</dd>
            <dt>Gum Condition</dt><dd>${esc(latestExam.gum)}</dd>
            <dt>Findings</dt><dd>${esc(latestExam.findings || 'No issues found')}</dd>
            <dt>Treatment Needed</dt><dd>${esc(latestExam.needs || 'None')}</dd>
          </dl>
        ` : `
          <div class="empty">No dental examination on record yet. Your dentist will record one during your first visit.</div>
        `}
      </div>
    </div>
  `;
}

async function handleSaveHistory(e) {
  e.preventDefault();
  const payload = {
    conditions: checked('pat_cond'),
    allergies: val('pat_all') || 'None',
    medications: val('pat_med') || 'None',
    past_treatment: checked('pat_past')
  };

  try {
    await api(`/api/patients/${STATE.user.patient_id}/history`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    toast('Health questionnaire updated successfully.');
    render();
  } catch (err) {
    toast(err.message || 'Failed to update health history', true);
  }
}

/* =========================================================================
   CLINICAL & STAFF SHARED VIEWS (PATIENTS, VISITS, TOOTH CHART)
   ========================================================================= */

// Tooth Chart constants
const UPPER_TEETH = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'];
const LOWER_TEETH = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'];
const COND_LABELS = { sound: 'Sound', decayed: 'Decayed', filled: 'Filled', missing: 'Missing', extracted: 'Extracted' };
const COND_COLORS = { sound: 'var(--tooth)', decayed: 'var(--dec)', filled: 'var(--fil)', missing: 'var(--mis)', extracted: 'var(--ext)' };

function toothKind(n) {
  const k = Number(n[1]);
  return k >= 6 ? 'molar' : k >= 4 ? 'premolar' : k === 3 ? 'canine' : 'incisor';
}

function rr(x, y, w, h, r) {
  return `M${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x + r}Q${x},${y + h} ${x},${y + h - r}V${y + r}Q${x},${y} ${x + r},${y}Z`;
}

function renderToothG(n, i, upper, cond, editable) {
  const x0 = 14 + i * 42 + (i >= 8 ? 16 : 0);
  const cx = x0 + 21;
  const kind = toothKind(n);
  const w = { molar: 34, premolar: 26, canine: 22, incisor: 22 }[kind];
  const x = cx - w / 2, ch = 30, rh = 20;
  const yc = upper ? 40 : 144;
  const crown = rr(x, yc, w, ch, 9);
  const yb = upper ? yc : yc + ch;
  const tip = upper ? yc - rh : yc + ch + rh;
  const root = kind === 'molar'
    ? `M${x + 3},${yb}L${x + w * 0.28},${tip}L${x + w * 0.5},${yb}L${x + w * 0.72},${tip}L${x + w - 3},${yb}Z`
    : `M${x + w * 0.2},${yb}L${cx},${tip}L${x + w * 0.8},${yb}Z`;
  const ly = upper ? 88 : 134;
  const cls = 'tooth ' + (cond && cond !== 'sound' ? cond : '') + (editable ? ' edit' : '');
  const xm = cond === 'extracted' ? `<path class="x" d="M${x + 4},${yc + 4}L${x + w - 4},${yc + ch - 4}M${x + w - 4},${yc + 4}L${x + 4},${yc + ch - 4}"/>` : '';

  return `
    <g class="${cls}" ${editable ? `role="button" tabindex="0" onclick="handleToothClick('${n}')"` : ''}>
      <title>Tooth ${n}: ${COND_LABELS[cond || 'sound']}</title>
      <path fill="var(--tooth)" stroke="var(--tooth-line)" d="${root}"/>
      <path fill="var(--tooth)" stroke="var(--tooth-line)" d="${crown}"/>
      ${xm}
      <text x="${cx}" y="${ly}">${n}</text>
    </g>
  `;
}

function renderChartSvg(teeth, editable = false) {
  return `
    <svg viewBox="0 0 700 208" role="img" aria-label="Adult Tooth Chart">
      <text x="14" y="12" style="font-size:11px;fill:var(--muted)">Patient's Right (Maxillary / Mandibular)</text>
      <text x="686" y="12" style="font-size:11px;fill:var(--muted);text-anchor:end">Patient's Left</text>
      ${UPPER_TEETH.map((n, i) => renderToothG(n, i, true, teeth[n], editable)).join('')}
      ${LOWER_TEETH.map((n, i) => renderToothG(n, i, false, teeth[n], editable)).join('')}
    </svg>
  `;
}

function chartCounts(teeth) {
  const vals = Object.values(teeth || {});
  const c = k => vals.filter(x => x === k).length;
  return `
    <span class="pill">Decayed: ${c('decayed')}</span>
    <span class="pill">Filled: ${c('filled')}</span>
    <span class="pill">Missing or Extracted: ${c('missing') + c('extracted')}</span>
  `;
}

function handleToothClick(n) {
  if (!STATE.draftExam) return;
  if (STATE.brush === 'sound') {
    delete STATE.draftExam.teeth[n];
  } else {
    STATE.draftExam.teeth[n] = STATE.brush;
  }
  const wrap = document.getElementById('chartwrap');
  if (wrap) wrap.innerHTML = renderChartSvg(STATE.draftExam.teeth, true);
  const counts = document.getElementById('chartcounts');
  if (counts) counts.innerHTML = chartCounts(STATE.draftExam.teeth);
}

// Patients Table & Search View (Separated Student & Personnel)
async function viewPatients() {
  const q = STATE.search.patients || '';
  const ptype = STATE.search.ptype || 'all';
  const patientFilter = STATE.search.patientFilter || 'all';

  // Fetch all patients for counts & filter
  const [dataFiltered, dataAll] = await Promise.all([
    api(`/api/patients?search=${encodeURIComponent(q)}&type=${encodeURIComponent(ptype)}`),
    api('/api/patients')
  ]);

  let list = dataFiltered.patients || [];
  const allList = dataAll.patients || [];
  if (patientFilter === 'unreviewed') list = list.filter(p => !p.history_reviewed);
  if (patientFilter === 'allergy') {
    list = list.filter(p => p.allergies && p.allergies.toLowerCase() !== 'none');
  }

  const studentCount = allList.filter(p => p.type === 'student').length;
  const personnelCount = allList.filter(p => p.type === 'personnel' || p.type === 'faculty').length;
  const needsReviewCount = allList.filter(p => !p.history_reviewed).length;
  const allergyCount = allList.filter(p => p.allergies && p.allergies.toLowerCase() !== 'none').length;
  const filterIsActive = filter => {
    if (filter === 'student' || filter === 'personnel') {
      return patientFilter === 'all' && ptype === filter;
    }
    return patientFilter === filter;
  };

  return `
    <div class="phead">
      <div>
        <h1>Patient Records Directory</h1>
        <p>Comprehensive patient profiles for students, faculty, and personnel at ${esc(STATE.user.campus_name)}.</p>
      </div>
      <div class="actions">
        <button class="btn pri" onclick="openNewPatientModal()">+ Manual Input Patient Record</button>
      </div>
    </div>

    <!-- Summary KPI Cards -->
    <div class="grid g4" style="margin-bottom:16px">
      <button type="button" class="stat ${filterIsActive('student') ? 'selected' : ''}" aria-pressed="${filterIsActive('student')}" onclick="setPatientDirectoryFilter('student')">
        <b>${studentCount}</b>
        <span>🎓 Registered Students</span>
      </button>
      <button type="button" class="stat ${filterIsActive('personnel') ? 'selected' : ''}" aria-pressed="${filterIsActive('personnel')}" onclick="setPatientDirectoryFilter('personnel')">
        <b>${personnelCount}</b>
        <span>👔 Registered Personnel</span>
      </button>
      <button type="button" class="stat ${needsReviewCount ? 'alert' : ''} ${filterIsActive('unreviewed') ? 'selected' : ''}" aria-pressed="${filterIsActive('unreviewed')}" onclick="setPatientDirectoryFilter('unreviewed')">
        <b>${needsReviewCount}</b>
        <span>⚠️ Unreviewed Histories</span>
      </button>
      <button type="button" class="stat ${filterIsActive('allergy') ? 'selected' : ''}" aria-pressed="${filterIsActive('allergy')}" onclick="setPatientDirectoryFilter('allergy')">
        <b>${allergyCount}</b>
        <span>🚨 Patients with Allergies</span>
      </button>
    </div>
    <div class="muted small" style="margin:-6px 0 12px">Select a card to filter the directory; select it again to clear that filter.</div>

    <div class="filters">
      <div class="field" style="flex:1;max-width:380px">
        <label>Search Patient Directory</label>
        <input type="text" id="q_pat" placeholder="Search by name, ID number, course, year, office, or email..." value="${esc(q)}" oninput="handlePatientSearch()">
      </div>
      <div class="field">
        <label>Specific Classification</label>
        <select class="in" id="q_type" onchange="handlePatientTypeFilter()">
          <option value="all" ${ptype === 'all' ? 'selected' : ''}>All Classifications</option>
          <option value="student" ${ptype === 'student' ? 'selected' : ''}>Students Only</option>
          <option value="personnel" ${ptype === 'personnel' ? 'selected' : ''}>All Personnel & Faculty</option>
          <option value="faculty" ${ptype === 'faculty' ? 'selected' : ''}>Faculty Members Only</option>
        </select>
      </div>
    </div>

    <div class="card patient-directory-card">
      <div class="tbl-wrap patient-directory-table-wrap">
        <table class="patient-directory-table">
          <colgroup>
            <col style="width:18%">
            <col style="width:9%">
            <col style="width:12%">
            <col style="width:17%">
            <col style="width:11%">
            <col style="width:17%">
            <col style="width:16%">
          </colgroup>
          <thead>
            <tr>
              <th>Patient Name</th>
              <th>Category</th>
              <th>ID Number</th>
              <th>College / Department</th>
              <th>Year / Designation</th>
              <th>Health & Allergy Flags</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.length ? list.map(p => {
              const hasAllergy = p.allergies && p.allergies.toLowerCase() !== 'none';
              const needsReview = !p.history_reviewed;
              return `
                <tr>
                  <td data-label="Patient Name">
                    <b>${esc(p.name)}</b>
                    <div class="muted small">${esc(p.email)}</div>
                  </td>
                  <td data-label="Category">${typePill(p.type)}</td>
                  <td data-label="ID Number"><code>${esc(p.id_no)}</code></td>
                  <td data-label="College / Department">${esc(p.unit || '-')}</td>
                  <td data-label="Year / Designation">${esc(p.level || (p.type === 'student' ? 'Student' : 'Staff'))}</td>
                  <td data-label="Health & Allergy Flags">
                    ${needsReview ? '<span class="pill warn">History Updated</span> ' : ''}
                    ${hasAllergy ? `<span class="pill bad">Allergy: ${esc(p.allergies)}</span>` : '<span class="pill ok">No allergies</span>'}
                  </td>
                  <td data-label="Actions">
                    <button class="btn sm row-actions-trigger" onclick="openPatientRowActions('${p.id}', 'patients')" aria-label="Actions for ${esc(p.name)}">Actions <span aria-hidden="true">▾</span></button>
                  </td>
                </tr>
              `;
            }).join('') : `<tr><td colspan="7" class="empty">No patients match your search or filter.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openPatientRowActions(patientId, source) {
  const patientIdArg = esc(patientId);
  const actions = source === 'visits'
    ? [
        { label: 'Open visit chart', action: `openPatientChart('${patientIdArg}', 'visits')`, primary: true },
        { label: 'View dental history', action: `openPatientChart('${patientIdArg}', 'history')` }
      ]
    : [
        { label: 'Open patient chart', action: `openPatientChart('${patientIdArg}', 'profile')`, primary: true },
        { label: 'View dental history', action: `openPatientChart('${patientIdArg}', 'history')` },
        { label: 'Edit patient record', action: `openEditPatientModal('${patientIdArg}')` },
        ...(STATE.user.role === 'staff'
          ? [{ label: 'Delete patient record', action: `deletePatient('${patientIdArg}')`, danger: true }]
          : [])
      ];

  const options = actions.map(item => `
    <button type="button" class="btn row-action-option${item.primary ? ' pri' : ''}${item.danger ? ' danger' : ''}" onclick="closeModal();${item.action}">
      ${esc(item.label)}
    </button>
  `).join('');
  modal(source === 'visits' ? 'Visit Actions' : 'Patient Actions', `<div class="row-action-options">${options}</div>`);
}

function setPatientDirectoryFilter(filter) {
  const patientFilter = STATE.search.patientFilter || 'all';
  const ptype = STATE.search.ptype || 'all';
  const selected = (filter === 'student' || filter === 'personnel')
    ? patientFilter === 'all' && ptype === filter
    : patientFilter === filter;

  if (selected) {
    STATE.search.ptype = 'all';
    STATE.search.patientFilter = 'all';
  } else if (filter === 'student' || filter === 'personnel') {
    STATE.search.ptype = filter;
    STATE.search.patientFilter = 'all';
  } else {
    STATE.search.ptype = 'all';
    STATE.search.patientFilter = filter;
  }
  render();
}
function handlePatientSearch() {
  STATE.search.patients = val('q_pat');
  render();
}
function handlePatientTypeFilter() {
  STATE.search.ptype = val('q_type');
  render();
}

// Patient Chart View
async function viewPatientChart() {
  const patientId = STATE.params.id;
  if (!patientId) {
    go('patients');
    return '';
  }

  const data = await api(`/api/patients/${patientId}`);
  const p = data.patient;
  const h = data.history || { conditions: [], allergies: 'None', medications: 'None', past_treatment: [] };
  const historyLog = data.historyLog || [];
  const exams = data.exams || [];
  const visits = data.visits || [];
  const refList = data.referrals || [];

  const tab = getTab('chart', 'profile');
  const isDentist = STATE.user.role === 'dentist';

  // Quick Action Bar
  const actionButtons = isDentist ? `
    <button class="btn pri" onclick="openRecordVisitModal('${p.id}')">Record Visit</button>
    <button class="btn" onclick="openCreateReferralModal('${p.id}')">Create Referral</button>
  ` : '';

  // Tab content renderer
  let tabContent = '';
  if (tab === 'profile') {
    tabContent = `
      <div class="card">
        <dl class="kv">
          <dt>Full Name</dt><dd><b>${esc(p.name)}</b></dd>
          <dt>Patient Type</dt><dd>${typePill(p.type)}</dd>
          <dt>Campus</dt><dd>${esc(STATE.user.campus_name)}</dd>
          <dt>ID Number</dt><dd>${esc(p.id_no)}</dd>
          <dt>College / Unit</dt><dd>${esc(p.unit || '-')}</dd>
          <dt>Year / Position</dt><dd>${esc(p.level || '-')}</dd>
          <dt>Sex / Birthdate</dt><dd>${esc(p.sex || '-')} &bull; ${fmtDate(p.birth)}</dd>
          <dt>Phone / Email</dt><dd>${esc(p.phone || '-')} &bull; ${esc(p.email)}</dd>
          <dt>Registered Date</dt><dd>${fmtDate(p.registered_at)}</dd>
          <dt>Proof Document</dt><dd>${esc(p.proof_name || 'id.pdf')}</dd>
        </dl>
      </div>
    `;
  } else if (tab === 'history') {
    const hasUnseen = historyLog.some(l => !l.seen);
    tabContent = `
      ${!h.reviewed ? `
        <div class="callout warn">
          <b>Dental History Updated Since Last Review.</b>
          ${isDentist ? `Carefully review changed questions below, then save edits or mark as reviewed.` : 'Waiting for dentist review.'}
        </div>
      ` : `
        <div class="callout ok">
          Reviewed by ${esc(h.reviewed_by || 'Dentist')} on ${fmtDate(h.reviewed_at)}.
        </div>
      `}

      <div class="card">
        <h2>Current Medical & Dental History</h2>
        ${isDentist ? `
          <form class="form" onsubmit="handleDentistSaveHistory(event, '${p.id}')">
            <div class="field">
              <span class="lbl">Medical Conditions</span>
              <div class="checks">
                ${['Asthma','Diabetes','High blood pressure','Heart condition','Bleeding problems','Hepatitis','Kidney disease'].map(c => `
                  <label><input type="checkbox" name="ch_cond" value="${esc(c)}" ${(h.conditions || []).includes(c) ? 'checked' : ''}>${esc(c)}</label>
                `).join('')}
              </div>
            </div>
            <div class="field"><label>Allergies</label><input type="text" id="ch_all" value="${esc(h.allergies)}"></div>
            <div class="field"><label>Current Medications</label><input type="text" id="ch_med" value="${esc(h.medications)}"></div>
            <div class="field">
              <span class="lbl">Past Dental Treatments</span>
              <div class="checks">
                ${['Cleaning','Filling','Extraction','Root canal','Braces','Gum treatment'].map(t => `
                  <label><input type="checkbox" name="ch_past" value="${esc(t)}" ${(h.past_treatment || []).includes(t) ? 'checked' : ''}>${esc(t)}</label>
                `).join('')}
              </div>
            </div>
            <div class="actions" style="margin-top:14px">
              <button type="submit" class="btn pri">Save Edits & Mark Reviewed</button>
              ${!h.reviewed ? `<button type="button" class="btn" onclick="markHistoryReviewed('${p.id}')">Mark Reviewed As-Is</button>` : ''}
            </div>
          </form>
        ` : `
          <dl class="kv">
            <dt>Conditions</dt><dd>${(h.conditions || []).join(', ') || 'None'}</dd>
            <dt>Allergies</dt><dd><b>${esc(h.allergies || 'None')}</b></dd>
            <dt>Medications</dt><dd>${esc(h.medications || 'None')}</dd>
            <dt>Past Treatment</dt><dd>${(h.past_treatment || []).join(', ') || 'None'}</dd>
          </dl>
        `}
      </div>

      <div class="card">
        <h2>Audit Change Log</h2>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>When</th><th>Changed By</th><th>Field</th><th>Before</th><th>After</th></tr></thead>
            <tbody>
              ${historyLog.length ? historyLog.map(l => `
                <tr>
                  <td>${esc(l.ts)}</td>
                  <td>${esc(l.by_name)}</td>
                  <td><b>${esc(l.field)}</b></td>
                  <td><del>${esc(l.from_val)}</del></td>
                  <td><ins>${esc(l.to_val)}</ins> ${!l.seen ? '<span class="pill warn">New</span>' : ''}</td>
                </tr>
              `).join('') : `<tr><td colspan="5" class="empty">No changes logged.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (tab === 'oral') {
    // Tooth chart tab
    if (!STATE.draftExam || STATE.draftExam.patient_id !== p.id) {
      const latest = exams[0];
      STATE.draftExam = {
        patient_id: p.id,
        teeth: Object.assign({}, latest ? latest.teeth : {}),
        gum: latest ? latest.gum : 'Healthy',
        findings: '',
        needs: '',
        remarks: ''
      };
    }
    const d = STATE.draftExam;

    tabContent = `
      ${isDentist ? `
        <div class="card">
          <h2>New Oral Examination</h2>
          <p class="sub">Select a dental brush condition, then click teeth on the chart. Save exam to record into profile.</p>

          <div class="brush">
            ${Object.keys(COND_LABELS).map(k => `
              <button type="button" class="${STATE.brush === k ? 'on' : ''}" onclick="setBrush('${k}')">
                <i style="background:${COND_COLORS[k]}"></i>${COND_LABELS[k]}
              </button>
            `).join('')}
          </div>

          <div class="chartbox" id="chartwrap">${renderChartSvg(d.teeth, true)}</div>
          <div id="chartcounts" style="margin:10px 0 16px">${chartCounts(d.teeth)}</div>

          <form class="form" onsubmit="handleSaveExam(event, '${p.id}')">
            <div class="fgrid">
              <div class="field">
                <label>Gingival (Gum) Status</label>
                <select class="in" id="ex_gum">
                  ${['Healthy', 'Mild inflammation', 'Moderate inflammation', 'Severe inflammation'].map(g => `
                    <option value="${g}" ${d.gum === g ? 'selected' : ''}>${g}</option>
                  `).join('')}
                </select>
              </div>
              <div class="field">
                <label>Treatment Needed</label>
                <input type="text" id="ex_needs" placeholder="e.g. Filling for tooth 36, prophylaxis">
              </div>
              <div class="field full">
                <label>Clinical Findings (visible to patient)</label>
                <textarea id="ex_findings" placeholder="Describe oral health, cavities, hygiene..."></textarea>
              </div>
              <div class="field full">
                <label>Staff Remarks (internal notes)</label>
                <textarea id="ex_remarks" placeholder="Notes for clinical staff..."></textarea>
              </div>
            </div>
            <div class="actions" style="margin-top:12px">
              <button type="submit" class="btn pri">Save Examination</button>
            </div>
          </form>
        </div>
      ` : `
        <div class="card">
          <h2>Latest Recorded Tooth Chart</h2>
          ${exams[0] ? `
            <div class="chartbox">${renderChartSvg(exams[0].teeth, false)}</div>
            <div style="margin:10px 0">${chartCounts(exams[0].teeth)}</div>
            <dl class="kv">
              <dt>Exam Date</dt><dd>${fmtDate(exams[0].date)}</dd>
              <dt>Gums</dt><dd>${esc(exams[0].gum)}</dd>
              <dt>Findings</dt><dd>${esc(exams[0].findings || 'None')}</dd>
              <dt>Needs</dt><dd>${esc(exams[0].needs || 'None')}</dd>
            </dl>
          ` : '<div class="empty">No dental exams recorded yet.</div>'}
        </div>
      `}

      <div class="card">
        <h2>Examination History</h2>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Date</th><th>Dentist</th><th>Gums</th><th>Findings</th><th>Treatment</th><th>Action</th></tr></thead>
            <tbody>
              ${exams.length ? exams.map(e => `
                <tr>
                  <td><b>${fmtDate(e.date)}</b></td>
                  <td>${esc(e.by_name)}</td>
                  <td>${esc(e.gum)}</td>
                  <td>${esc(e.findings || '-')}</td>
                  <td>${esc(e.needs || '-')}</td>
                  <td><button class="btn sm" onclick="viewExamDetails('${encodeURIComponent(JSON.stringify(e))}')">View</button></td>
                </tr>
              `).join('') : `<tr><td colspan="6" class="empty">No past exams.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (tab === 'visits') {
    tabContent = `
      <div class="card">
        <h2>Past Visits</h2>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Date</th><th>Source</th><th>Consultation</th><th>Services</th><th>Dentist</th><th>Notes</th></tr></thead>
            <tbody>
              ${visits.length ? visits.map(v => `
                <tr>
                  <td><b>${fmtDate(v.date)}</b></td>
                  <td>${esc(v.source)}</td>
                  <td>${v.consult ? '<span class="pill ok">Yes</span>' : '<span class="pill">No</span>'}</td>
                  <td>${esc(v.services.join(', ') || '-')}</td>
                  <td>${esc(v.dentist_name)}</td>
                  <td>${esc(v.notes || '-')}</td>
                </tr>
              `).join('') : `<tr><td colspan="6" class="empty">No visits recorded.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (tab === 'referrals') {
    tabContent = `
      <div class="card">
        <h2>Referrals</h2>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Destination</th><th>Reason</th><th>Progress</th><th>Created By</th><th>Action</th></tr></thead>
            <tbody>
              ${refList.length ? refList.map(r => `
                <tr>
                  <td><b>${esc(r.referred_to)}</b></td>
                  <td>${esc(r.reason)}</td>
                  <td>${refPill(r.status)} ${stageBar(r)}</td>
                  <td>${esc(r.created_by)}</td>
                  <td>
                    ${STATE.user.role === 'staff' && r.status !== 'Completed' ? `
                      <button class="btn sm" onclick="openReferralStageModal('${r.id}','${r.status}')">Update Status</button>
                    ` : '<span class="muted small">—</span>'}
                  </td>
                </tr>
              `).join('') : `<tr><td colspan="5" class="empty">No referrals.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  return `
    <div style="margin-bottom:14px">
      <button class="btn sm" onclick="go('patients')">&larr; Back to Patients</button>
    </div>
    <div class="phead">
      <div>
        <h1>${esc(p.name)}</h1>
        <p>${typePill(p.type)} &bull; ID: ${esc(p.id_no)} &bull; ${esc(p.unit || '')}</p>
      </div>
      <div class="actions">${actionButtons}</div>
    </div>

    <div class="tabs">
      <button class="${tab === 'profile' ? 'on' : ''}" onclick="setTab('chart','profile')">Profile</button>
      <button class="${tab === 'history' ? 'on' : ''}" onclick="setTab('chart','history')">Dental History</button>
      <button class="${tab === 'oral' ? 'on' : ''}" onclick="setTab('chart','oral')">Oral Health & Tooth Chart</button>
      <button class="${tab === 'visits' ? 'on' : ''}" onclick="setTab('chart','visits')">Visits</button>
      <button class="${tab === 'referrals' ? 'on' : ''}" onclick="setTab('chart','referrals')">Referrals</button>
    </div>

    ${tabContent}
  `;
}

function openPatientChart(id, tab = 'profile') {
  STATE.tabs.chart = tab;
  STATE.draftExam = null;
  go('chart', { id });
}

function setBrush(b) {
  STATE.brush = b;
  render();
}

async function handleDentistSaveHistory(e, patientId) {
  e.preventDefault();
  const payload = {
    conditions: checked('ch_cond'),
    allergies: val('ch_all') || 'None',
    medications: val('ch_med') || 'None',
    past_treatment: checked('ch_past')
  };
  try {
    await api(`/api/patients/${patientId}/history`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    toast('Dental history edits saved & marked as reviewed.');
    render();
  } catch (err) {
    toast(err.message || 'Save failed', true);
  }
}

async function markHistoryReviewed(patientId) {
  try {
    await api(`/api/patients/${patientId}/review`, { method: 'POST' });
    toast('History marked as reviewed.');
    render();
  } catch (err) {
    toast(err.message || 'Review failed', true);
  }
}

async function handleSaveExam(e, patientId) {
  e.preventDefault();
  if (!STATE.draftExam) return;

  const payload = {
    patient_id: patientId,
    teeth: STATE.draftExam.teeth,
    gum: val('ex_gum'),
    needs: val('ex_needs'),
    findings: val('ex_findings'),
    remarks: val('ex_remarks'),
    date: new Date().toISOString().slice(0, 10)
  };

  try {
    await api('/api/exams', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    toast('Dental examination and tooth chart saved successfully!');
    STATE.draftExam = null;
    render();
  } catch (err) {
    toast(err.message || 'Failed to save exam', true);
  }
}

function viewExamDetails(examJsonStr) {
  const e = JSON.parse(decodeURIComponent(examJsonStr));
  const html = `
    <div class="chartbox">${renderChartSvg(e.teeth, false)}</div>
    <div style="margin:10px 0">${chartCounts(e.teeth)}</div>
    <dl class="kv">
      <dt>Exam Date</dt><dd>${fmtDate(e.date)}</dd>
      <dt>Dentist</dt><dd>${esc(e.by_name)}</dd>
      <dt>Gum Condition</dt><dd>${esc(e.gum)}</dd>
      <dt>Clinical Findings</dt><dd>${esc(e.findings || 'None')}</dd>
      <dt>Treatment Needed</dt><dd>${esc(e.needs || 'None')}</dd>
      <dt>Internal Remarks</dt><dd>${esc(e.remarks || '-')}</dd>
    </dl>
  `;
  modal(`Examination: ${fmtDate(e.date)}`, html, '', true);
}

// Visits Table View (Separated Student & Personnel Log)
async function viewVisits() {
  const currentTab = getTab('visits_tab', 'all');
  const savedSourceFilter = STATE.search.visits_src || 'all';
  const sourceFilter = currentTab === 'emergency' ? 'Emergency Walk-in' : savedSourceFilter;
  const query = (STATE.search.visits_q || '').toLowerCase().trim();

  const data = await api('/api/visits');
  const allVisits = data.visits || [];

  const studentVisits = allVisits.filter(v => v.patient_type === 'student');
  const personnelVisits = allVisits.filter(v => v.patient_type === 'personnel' || v.patient_type === 'faculty');
  const emergencyVisits = allVisits.filter(v => v.source === 'Emergency Walk-in');

  // Filter according to active tab
  let filtered = allVisits;
  if (currentTab === 'student') filtered = studentVisits;
  else if (currentTab === 'personnel') filtered = personnelVisits;
  else if (currentTab === 'emergency') filtered = emergencyVisits;

  // Filter by source if set
  if (sourceFilter !== 'all') {
    filtered = filtered.filter(v => v.source === sourceFilter);
  }

  // Filter by search query
  if (query) {
    filtered = filtered.filter(v =>
      (v.patient_name || '').toLowerCase().includes(query) ||
      (v.patient_id_no || '').toLowerCase().includes(query) ||
      (v.patient_unit || '').toLowerCase().includes(query) ||
      (v.patient_level || '').toLowerCase().includes(query) ||
      (v.dentist_name || '').toLowerCase().includes(query) ||
      (v.notes || '').toLowerCase().includes(query) ||
      (v.teeth || '').toLowerCase().includes(query)
    );
  }

  // Compute key metrics
  const totalConsultations = allVisits.filter(v => v.consult).length;
  const totalExtractions = allVisits.filter(v => (v.services || []).includes('s3') || (v.service_names || []).some(n => n.toLowerCase().includes('extraction'))).length;

  return `
    <div class="phead">
      <div>
        <h1>Clinical Visits Log</h1>
        <p>Visits recorded at ${esc(STATE.user.campus_name)} for students and personnel &bull; Live operational tracking.</p>
      </div>
      <div class="actions">
        <button class="btn" style="border-color:var(--bad);color:var(--bad);font-weight:700" onclick="openRecordVisitModal(null, 'Emergency Walk-in')">🚨 Log Emergency Walk-in</button>
        <button class="btn pri" onclick="openRecordVisitModal()">+ Record New Visit</button>
      </div>
    </div>

    <!-- Summary KPI Cards -->
    <div class="grid g4" style="margin-bottom:16px">
      <button type="button" class="stat ${currentTab === 'all' ? 'selected' : ''}" aria-pressed="${currentTab === 'all'}" onclick="setVisitsTab('all')">
        <b>${allVisits.length}</b>
        <span>📋 Total Visits Logged</span>
      </button>
      <button type="button" class="stat ${currentTab === 'student' ? 'selected' : ''}" aria-pressed="${currentTab === 'student'}" onclick="setVisitsTab('student')">
        <b>${studentVisits.length}</b>
        <span>🎓 Student Visits</span>
      </button>
      <button type="button" class="stat ${currentTab === 'personnel' ? 'selected' : ''}" aria-pressed="${currentTab === 'personnel'}" onclick="setVisitsTab('personnel')">
        <b>${personnelVisits.length}</b>
        <span>👔 Personnel Visits</span>
      </button>
      <button type="button" class="stat ${emergencyVisits.length ? 'alert' : ''} ${currentTab === 'emergency' ? 'selected' : ''}" aria-pressed="${currentTab === 'emergency'}" onclick="setVisitsTab('emergency')">
        <b>${emergencyVisits.length}</b>
        <span>🚨 Emergency Walk-ins</span>
      </button>
    </div>

    <!-- Search and Arrival Source Filter -->
    <div class="filters">
      <div class="field" style="flex:1;max-width:380px">
        <label>Search Visits</label>
        <input type="text" id="v_search" placeholder="Search by patient, ID, course, year, teeth, notes, or dentist..." value="${esc(STATE.search.visits_q || '')}" oninput="handleVisitsSearch(this.value)">
      </div>
      <div class="field">
        <label>Arrival Source</label>
        <select class="in" id="v_src_filter" onchange="handleVisitsSourceFilter(this.value)" ${currentTab === 'emergency' ? 'disabled' : ''}>
          <option value="all" ${sourceFilter === 'all' ? 'selected' : ''}>All Arrival Sources</option>
          <option value="Emergency Walk-in" ${sourceFilter === 'Emergency Walk-in' ? 'selected' : ''}>🚨 Emergency Walk-in</option>
          <option value="Walk-in" ${sourceFilter === 'Walk-in' ? 'selected' : ''}>🚶 Routine Walk-in</option>
          <option value="Appointment" ${sourceFilter === 'Appointment' ? 'selected' : ''}>📅 Scheduled Appointment</option>
        </select>
      </div>
    </div>

    <div class="card">
      <div class="tbl-wrap">
        <table class="visits-table">
          <colgroup>
            <col style="width:7%">
            <col style="width:9%">
            <col style="width:9%">
            <col style="width:12%">
            <col style="width:10%">
            <col style="width:16%">
            <col style="width:17%">
            <col style="width:11%">
            <col style="width:9%">
          </colgroup>
          <thead>
            <tr>
              <th>Date</th>
              <th>Patient Name</th>
              <th>Category</th>
              <th>Arrival Source</th>
              <th>Client Status</th>
              <th>Services & Procedures</th>
              <th>Teeth / Notes</th>
              <th>Attending Dentist</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length ? filtered.map(v => {
              const serviceLabels = v.service_names && v.service_names.length ? v.service_names : v.services;
              const hasExtraction = (v.services || []).includes('s3') || (serviceLabels || []).some(s => String(s).toLowerCase().includes('extraction'));
              const hasExam = (v.services || []).includes('s1') || (serviceLabels || []).some(s => String(s).toLowerCase().includes('examination'));
              const hasReferral = (v.services || []).includes('s10') || (serviceLabels || []).some(s => String(s).toLowerCase().includes('referral'));

              return `
                <tr>
                  <td><b>${fmtDate(v.date)}</b></td>
                  <td>
                    <b>${esc(v.patient_name)}</b>
                    ${v.patient_id_no ? `<div class="muted small">${esc(v.patient_id_no)}</div>` : ''}
                  </td>
                  <td>${typePill(v.patient_type)}</td>
                  <td>${sourcePill(v.source)}</td>
                  <td>
                    ${v.is_first_time ? '<span class="pill pri">First-time Client</span>' : '<span class="pill">Returning</span>'}
                  </td>
                  <td>
                    <div class="visit-services">
                      ${v.consult ? '<span class="pill consult">Consultation</span>' : ''}
                      ${hasExam ? '<span class="pill exam">Oral Exam</span>' : ''}
                      ${hasExtraction ? `<span class="pill extract">Tooth Extraction ${v.teeth ? `(#${esc(v.teeth)})` : ''}</span>` : ''}
                      ${hasReferral ? '<span class="pill warn">Dental Referral</span>' : ''}
                      ${serviceLabels.filter(s => !String(s).toLowerCase().includes('examination') && !String(s).toLowerCase().includes('extraction') && !String(s).toLowerCase().includes('referral') && !String(s).toLowerCase().includes('consultation')).map(s => `
                        <span class="pill">${esc(s)}</span>
                      `).join('')}
                    </div>
                  </td>
                  <td>
                    ${v.teeth ? `<b>Teeth: ${esc(v.teeth)}</b> &bull; ` : ''}
                    <span class="small visit-notes">${esc(v.notes || '-')}</span>
                  </td>
                  <td>${esc(v.dentist_name)}</td>
                  <td>
                    <button class="btn sm row-actions-trigger" onclick="openPatientRowActions('${v.patient_id}', 'visits')" aria-label="Actions for ${esc(v.patient_name)}">Actions <span aria-hidden="true">▾</span></button>
                  </td>
                </tr>
              `;
            }).join('') : `<tr><td colspan="9" class="empty">No visits found matching this filter.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function setVisitsTab(tab) {
  setTab('visits_tab', tab);
}
function handleVisitsSearch(val) {
  STATE.search.visits_q = val;
  render();
}
function handleVisitsSourceFilter(val) {
  STATE.search.visits_src = val;
  render();
}

async function openRecordVisitModal(preselectedPatientId = null, defaultSource = 'Walk-in') {
  const [patientsData, servicesData, apptsData] = await Promise.all([
    api('/api/patients'),
    api('/api/setup/services').catch(() => ({ services: [] })),
    api('/api/appointments?status=Approved')
  ]);

  const patients = patientsData.patients || [];
  const services = servicesData.services || [];
  const appts = apptsData.appointments || [];

  const html = `
    <form class="form" onsubmit="handleSaveVisit(event)">
      <div class="fgrid">
        <div class="field full">
          <label>Select Patient (Student or Personnel) *</label>
          <select class="in" id="vs_pat" required onchange="handleVisitPatientChange(this.value)">
            <option value="">Select Patient...</option>
            <optgroup label="🎓 Students">
              ${patients.filter(p => p.type === 'student').map(p => `
                <option value="${p.id}" ${p.id === preselectedPatientId ? 'selected' : ''}>
                  ${esc(p.name)} (${esc(p.id_no)} &bull; ${esc(p.unit || 'Student')})
                </option>
              `).join('')}
            </optgroup>
            <optgroup label="👔 Faculty & Personnel">
              ${patients.filter(p => p.type !== 'student').map(p => `
                <option value="${p.id}" ${p.id === preselectedPatientId ? 'selected' : ''}>
                  ${esc(p.name)} (${esc(p.id_no)} &bull; ${esc(p.unit || 'Staff')})
                </option>
              `).join('')}
            </optgroup>
          </select>
        </div>

        <div class="field">
          <label>Visit Date *</label>
          <input type="date" id="vs_date" value="${new Date().toISOString().slice(0, 10)}" required>
        </div>

        <div class="field">
          <label>Arrival Source *</label>
          <select class="in" id="vs_src">
            <option value="Walk-in" ${defaultSource === 'Walk-in' ? 'selected' : ''}>🚶 Routine Walk-in</option>
            <option value="Emergency Walk-in" ${defaultSource === 'Emergency Walk-in' ? 'selected' : ''} style="color:red;font-weight:700">🚨 Emergency Walk-in</option>
            <option value="Appointment" ${defaultSource === 'Appointment' ? 'selected' : ''}>📅 Scheduled Appointment</option>
          </select>
        </div>

        <div class="field full">
          <label>Linked Appointment (if scheduled)</label>
          <select class="in" id="vs_appt">
            <option value="">None / Walk-in</option>
            ${appts.map(a => `<option value="${a.id}">${fmtDate(a.date)} ${fmtTime(a.time)} - ${esc(a.patient_name)} (${esc(a.reason || 'Checkup')})</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Core Clinical Services Checklist -->
      <h3 style="margin:14px 0 6px;font-size:14px;color:var(--pri)">🩺 Clinical Services & Examination</h3>
      <div class="field" style="margin-bottom:8px">
        <label style="display:flex;gap:8px;align-items:center;font-weight:600;font-size:14px">
          <input type="checkbox" id="vs_consult" checked>
          <span>Dental Consultation Conducted</span>
        </label>
      </div>

      <div class="field">
        <span class="lbl">Services Performed</span>
        <div class="checks" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:6px">
          ${services.map(s => `
            <label style="display:flex;gap:6px;align-items:center">
              <input type="checkbox" name="vs_svcs" value="${s.id}" onchange="toggleServiceSubfields(this, '${s.id}')">
              <span>${esc(s.name)}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <div class="fgrid" style="margin-top:10px">
        <div class="field">
          <label>Treated Tooth Numbers (FDI notation, e.g. 16, 36, 48)</label>
          <input type="text" id="vs_teeth" placeholder="e.g. 16, 36">
        </div>
        <div class="field">
          <label>Clinical Notes / Findings</label>
          <input type="text" id="vs_notes" placeholder="Observations, diagnosis, or anesthesia used...">
        </div>
      </div>

      <!-- Dental Referral Sub-section (Appears when referral is checked or optional) -->
      <div id="vs_referral_section" style="margin-top:12px;padding:12px;border:1px dashed var(--line);border-radius:var(--rs);background:var(--surface2)">
        <h4 style="margin:0 0 8px;font-size:13px;display:flex;align-items:center;gap:6px">
          <span>🔗 Issue Dental Referral (Optional)</span>
        </h4>
        <div class="fgrid">
          <div class="field">
            <label>Referred To (Hospital / Specialist Facility)</label>
            <input type="text" id="vs_ref_to" placeholder="e.g. City General Hospital, Oral Surgery Unit">
          </div>
          <div class="field">
            <label>Reason for Dental Referral</label>
            <input type="text" id="vs_ref_reason" placeholder="e.g. Impacted wisdom tooth surgical removal, Panorex X-ray">
          </div>
        </div>
      </div>

      <div class="actions" style="margin-top:16px">
        <button type="button" class="btn" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn pri">Save Visit Record</button>
      </div>
    </form>
  `;

  modal(defaultSource === 'Emergency Walk-in' ? '🚨 Log Emergency Walk-in Visit' : 'Record Clinical Visit', html, true);
}

function handleVisitPatientChange(pid) {
  // Can be extended if needed
}

function toggleServiceSubfields(checkbox, sid) {
  // Highlight referral or tooth extraction inputs
  if (sid === 's10' || sid === 's3') {
    if (checkbox.checked && sid === 's3') {
      const teethIn = document.getElementById('vs_teeth');
      if (teethIn) teethIn.focus();
    }
  }
}

async function handleSaveVisit(e) {
  e.preventDefault();
  const payload = {
    patient_id: val('vs_pat'),
    date: val('vs_date'),
    source: val('vs_src'),
    appointment_id: val('vs_appt') || null,
    consult: document.getElementById('vs_consult').checked,
    services: checked('vs_svcs'),
    teeth: val('vs_teeth'),
    notes: val('vs_notes'),
    referral_to: val('vs_ref_to'),
    referral_reason: val('vs_ref_reason')
  };

  if (!payload.patient_id) {
    toast('Please select a patient.', true);
    return;
  }

  try {
    const res = await api('/api/visits', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    toast(res.referral_id ? 'Visit and Dental Referral recorded successfully!' : 'Visit recorded successfully.');
    closeModal();
    render();
  } catch (err) {
    toast(err.message || 'Failed to save visit', true);
  }
}

/* =========================================================================
   REFERRALS VIEWS
   ========================================================================= */

async function viewReferrals() {
  const stage = STATE.rf.stage;
  const data = await api(`/api/referrals?status=${encodeURIComponent(stage)}`);
  const list = data.referrals || [];
  const isDentist = STATE.user.role === 'dentist';

  return `
    <div class="phead">
      <div>
        <h1>Referral Tracking</h1>
        <p>Monitor patient referral progression to external clinics and hospitals.</p>
      </div>
      <div class="actions">
        ${isDentist ? `<button class="btn pri" onclick="openCreateReferralModal()">Create Referral</button>` : ''}
      </div>
    </div>

    <div class="filters">
      <div class="field">
        <label>Filter by Status</label>
        <select class="in" id="rf_filter" onchange="STATE.rf.stage=this.value;render()">
          <option value="all" ${stage === 'all' ? 'selected' : ''}>All Stages</option>
          <option value="Referred" ${stage === 'Referred' ? 'selected' : ''}>Referred</option>
          <option value="Contacted" ${stage === 'Contacted' ? 'selected' : ''}>Contacted</option>
          <option value="Availed" ${stage === 'Availed' ? 'selected' : ''}>Availed</option>
          <option value="Completed" ${stage === 'Completed' ? 'selected' : ''}>Completed</option>
          <option value="Pending" ${stage === 'Pending' ? 'selected' : ''}>Pending</option>
        </select>
      </div>
    </div>

    <div class="card">
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Referred Facility</th>
              <th>Reason</th>
              <th>Status & Progress</th>
              <th>Created By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.length ? list.map(r => `
              <tr>
                <td><b>${esc(r.patient_name)}</b></td>
                <td><b>${esc(r.referred_to)}</b></td>
                <td>${esc(r.reason)}</td>
                <td>${refPill(r.status)} ${stageBar(r)}</td>
                <td>${esc(r.created_by)}</td>
                <td>
                  <div class="actions">
                    ${STATE.user.role === 'staff' && r.status !== 'Completed' ? `
                      <button class="btn sm pri" onclick="openReferralStageModal('${r.id}','${r.status}')">Update Stage</button>
                    ` : '<span class="muted small">—</span>'}
                  </div>
                </td>
              </tr>
            `).join('') : `<tr><td colspan="6" class="empty">No referrals found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function openCreateReferralModal(preselectedPatientId = null) {
  const patientsData = await api('/api/patients');
  const patients = patientsData.patients || [];

  const html = `
    <form class="form" onsubmit="handleCreateReferralSubmit(event)">
      <div class="field">
        <label>Patient *</label>
        <select class="in" id="rf_pat" required>
          <option value="">Select Patient...</option>
          ${patients.map(p => `
            <option value="${p.id}" ${p.id === preselectedPatientId ? 'selected' : ''}>
              ${esc(p.name)} (ID: ${esc(p.id_no)})
            </option>
          `).join('')}
        </select>
      </div>
      <div class="field">
        <label>Referred Facility or Specialist *</label>
        <input type="text" id="rf_to" placeholder="e.g. City General Hospital, Oral Surgery" required>
      </div>
      <div class="field">
        <label>Reason for Referral *</label>
        <textarea id="rf_reason" placeholder="Describe diagnosis and reason for specialized treatment..." required></textarea>
      </div>
      <div class="actions" style="margin-top:14px">
        <button type="button" class="btn" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn pri">Save Referral</button>
      </div>
    </form>
  `;
  modal('Create External Referral', html);
}

async function handleCreateReferralSubmit(e) {
  e.preventDefault();
  const payload = {
    patient_id: val('rf_pat'),
    referred_to: val('rf_to'),
    reason: val('rf_reason')
  };

  try {
    await api('/api/referrals', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    toast('Referral created successfully.');
    closeModal();
    render();
  } catch (err) {
    toast(err.message || 'Creation failed', true);
  }
}

function openReferralStageModal(id, currentStatus) {
  const stages = ['Referred', 'Contacted', 'Availed', 'Completed', 'Pending'];

  const html = `
    <form class="form" onsubmit="handleReferralStageSubmit(event, '${id}')">
      <div class="field">
        <label>Progress Stage *</label>
        <select class="in" id="rf_next_stage">
          ${stages.map(stage => `<option value="${stage}" ${stage === currentStatus ? 'selected' : ''}>${stage}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Date of Progression</label>
        <input type="date" id="rf_stage_date" value="${new Date().toISOString().slice(0, 10)}">
      </div>
      <div class="actions" style="margin-top:14px">
        <button type="button" class="btn" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn pri">Update Stage</button>
      </div>
    </form>
  `;
  modal('Progress Referral Stage', html);
}

async function handleReferralStageSubmit(e, id) {
  e.preventDefault();
  const status = val('rf_next_stage');
  const date = val('rf_stage_date');

  try {
    await api(`/api/referrals/${id}/stage`, {
      method: 'PUT',
      body: JSON.stringify({ status, date })
    });
    toast(`Referral updated to ${status}.`);
    closeModal();
    render();
  } catch (err) {
    toast(err.message || 'Update failed', true);
  }
}

/* =========================================================================
   REPORTS VIEWS & PIE CHARTS
   ========================================================================= */

function renderPieChartSvg(slices, options = {}) {
  const total = slices.reduce((sum, s) => sum + (s.value || 0), 0);
  const size = options.size || 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) - 12;

  if (total === 0) {
    return `
      <div class="pie-empty">
        <div>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.35;margin-bottom:6px">
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z"/>
          </svg>
          <div>No services recorded in this period</div>
        </div>
      </div>
    `;
  }

  const nonZero = slices.filter(s => (s.value || 0) > 0);
  let svgPaths = '';

  if (nonZero.length === 1) {
    const s = nonZero[0];
    svgPaths = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.color}"><title>${esc(s.label)}: ${s.value} (100%)</title></circle>`;
  } else {
    let currentAngle = -Math.PI / 2; // Start from 12 o'clock
    for (const s of nonZero) {
      const sliceAngle = (s.value / total) * 2 * Math.PI;
      const endAngle = currentAngle + sliceAngle;

      const x1 = cx + r * Math.cos(currentAngle);
      const y1 = cy + r * Math.sin(currentAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);

      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      const pct = Math.round((s.value / total) * 100);

      const pathData = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
      svgPaths += `<path d="${pathData}" fill="${s.color}" stroke="var(--surface)" stroke-width="1.5"><title>${esc(s.label)}: ${s.value} (${pct}%)</title></path>`;

      currentAngle = endAngle;
    }
  }

  const legendHtml = `
    <div class="pie-legend">
      ${slices.map(s => {
        const val = s.value || 0;
        const pct = total > 0 ? Math.round((val / total) * 100) : 0;
        return `
          <div class="pie-legend-row" title="${esc(s.label)}: ${val} (${pct}%)">
            <span class="pie-legend-label">
              <span class="pie-dot" style="background:${s.color}"></span>
              <span>${esc(s.label)}</span>
            </span>
            <span class="pie-legend-val">${val} <span class="muted small">(${pct}%)</span></span>
          </div>
        `;
      }).join('')}
      <div class="pie-legend-row pie-legend-total">
        <span>Total Services</span>
        <span>${total}</span>
      </div>
    </div>
  `;

  return `
    <div class="pie-body">
      <div class="pie-svg-wrap">
        <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Services pie graph">
          ${svgPaths}
        </svg>
      </div>
      ${legendHtml}
    </div>
  `;
}

async function viewReports() {
  const m = STATE.rf.month;
  const isMain = STATE.user.campus_id === 'main';
  const c = STATE.rf.campus;

  const data = await api(`/api/reports/monthly?month=${m}&campus=${c}`);
  const reports = data.reports || {};
  const campusIds = Object.keys(reports);

  // Aggregate metrics for Pie Graphs
  const aggAll = { consultations: 0, exams: 0, extractions: 0, referrals: 0, procedures: 0 };
  const aggStudent = { consultations: 0, exams: 0, extractions: 0, referrals: 0, procedures: 0 };
  const aggPersonnel = { consultations: 0, exams: 0, extractions: 0, referrals: 0, procedures: 0 };

  for (const cid of campusIds) {
    const r = reports[cid] || {};
    const sbt = r.services_by_type || {};
    const sAll = sbt.all || {};
    const sStu = sbt.student || {};
    const sPer = sbt.personnel || {};

    aggAll.consultations += sAll.consultations || r.consultations || 0;
    aggAll.exams += sAll.exams || r.exams || 0;
    aggAll.extractions += sAll.extractions || r.extractions || 0;
    aggAll.referrals += sAll.referrals || r.referrals || 0;
    aggAll.procedures += sAll.procedures || r.procedures || 0;

    aggStudent.consultations += sStu.consultations || 0;
    aggStudent.exams += sStu.exams || 0;
    aggStudent.extractions += sStu.extractions || 0;
    aggStudent.referrals += sStu.referrals || 0;
    aggStudent.procedures += sStu.procedures || 0;

    aggPersonnel.consultations += sPer.consultations || 0;
    aggPersonnel.exams += sPer.exams || 0;
    aggPersonnel.extractions += sPer.extractions || 0;
    aggPersonnel.referrals += sPer.referrals || 0;
    aggPersonnel.procedures += sPer.procedures || 0;
  }

  const allSlices = [
    { label: 'Consultation', value: aggAll.consultations, color: '#0284c7' },
    { label: 'Oral Examination', value: aggAll.exams, color: '#0d9488' },
    { label: 'Tooth Extraction', value: aggAll.extractions, color: '#e11d48' },
    { label: 'Dental Referral', value: aggAll.referrals, color: '#f59e0b' },
    { label: 'Other Procedures', value: aggAll.procedures, color: '#8b5cf6' }
  ];

  const studentSlices = [
    { label: 'Consultation', value: aggStudent.consultations, color: '#0284c7' },
    { label: 'Oral Examination', value: aggStudent.exams, color: '#0d9488' },
    { label: 'Tooth Extraction', value: aggStudent.extractions, color: '#e11d48' },
    { label: 'Dental Referral', value: aggStudent.referrals, color: '#f59e0b' },
    { label: 'Other Procedures', value: aggStudent.procedures, color: '#8b5cf6' }
  ];

  const personnelSlices = [
    { label: 'Consultation', value: aggPersonnel.consultations, color: '#0284c7' },
    { label: 'Oral Examination', value: aggPersonnel.exams, color: '#0d9488' },
    { label: 'Tooth Extraction', value: aggPersonnel.extractions, color: '#e11d48' },
    { label: 'Dental Referral', value: aggPersonnel.referrals, color: '#f59e0b' },
    { label: 'Other Procedures', value: aggPersonnel.procedures, color: '#8b5cf6' }
  ];

  return `
    <div class="phead">
      <div>
        <h1>Monthly Dental Service Reports & Analytics</h1>
        <p>Calculated directly from clinical visits, exams, procedures, and referrals.</p>
      </div>
    </div>

    <div class="filters">
      <div class="field">
        <label>Select Month</label>
        <input type="month" id="rep_month" value="${m}" onchange="STATE.rf.month=this.value;render()">
      </div>
      ${isMain ? `
        <div class="field">
          <label>Campus</label>
          <select class="in" id="rep_campus" onchange="STATE.rf.campus=this.value;render()">
            <option value="all" ${c === 'all' ? 'selected' : ''}>All Campuses</option>
            <option value="main" ${c === 'main' ? 'selected' : ''}>Main Campus</option>
            <option value="sa" ${c === 'sa' ? 'selected' : ''}>Satellite Campus A</option>
            <option value="sb" ${c === 'sb' ? 'selected' : ''}>Satellite Campus B</option>
          </select>
        </div>
      ` : ''}
    </div>

    <h2 class="analytics-section-heading">Services Distribution Pie Graphs</h2>
    <div class="pie-grid">
      <div class="pie-card">
        <h3>📊 All Services Rendered</h3>
        <p class="sub">Total service distribution for ${ymLabel(m)}</p>
        ${renderPieChartSvg(allSlices)}
      </div>
      <div class="pie-card">
        <h3>🎓 Student Services Breakdown</h3>
        <p class="sub">Services rendered to university students</p>
        ${renderPieChartSvg(studentSlices)}
      </div>
      <div class="pie-card">
        <h3>👔 Personnel Services Breakdown</h3>
        <p class="sub">Services rendered to faculty & staff personnel</p>
        ${renderPieChartSvg(personnelSlices)}
      </div>
    </div>

    <div class="card metrics-card">
      <div class="metrics-heading">
        <h2>Service Metrics Breakdown</h2>
        <span class="pill pri">${ymLabel(m)}</span>
      </div>
      <div class="tbl-wrap">
        <table class="metrics-table">
          <thead>
            <tr>
              <th>Metric</th>
              ${campusIds.map(cid => {
                const campusName = cid === 'main' ? 'Main Campus' : cid === 'sa' ? 'Satellite A' : 'Satellite B';
                const compactName = cid === 'main' ? 'Main' : cid === 'sa' ? 'Sat. A' : 'Sat. B';
                return `<th><span class="metrics-campus-full">${campusName}</span><span class="metrics-campus-compact">${compactName}</span></th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>Dental Consultations</b></td>
              ${campusIds.map(cid => `<td><b>${reports[cid].consultations || 0}</b></td>`).join('')}
            </tr>
            <tr>
              <td><b>Oral Examinations (Oral Exam)</b></td>
              ${campusIds.map(cid => `<td>${reports[cid].exams || 0}</td>`).join('')}
            </tr>
            <tr>
              <td><b>Tooth Extractions</b></td>
              ${campusIds.map(cid => `<td>${reports[cid].extractions || 0}</td>`).join('')}
            </tr>
            <tr>
              <td><b>Dental Referrals Issued</b></td>
              ${campusIds.map(cid => `<td>${reports[cid].referrals || 0}</td>`).join('')}
            </tr>
            <tr>
              <td><b>Other Dental Procedures Performed</b></td>
              ${campusIds.map(cid => `<td>${reports[cid].procedures || 0}</td>`).join('')}
            </tr>
            <tr class="grp"><td colspan="${campusIds.length + 1}">Arrival Source Breakdown</td></tr>
            <tr>
              <td>Emergency Walk-ins</td>
              ${campusIds.map(cid => `<td><span class="pill emergency">${reports[cid].emergency_walkins || 0}</span></td>`).join('')}
            </tr>
            <tr>
              <td>Routine Walk-ins</td>
              ${campusIds.map(cid => `<td>${reports[cid].routine_walkins || 0}</td>`).join('')}
            </tr>
            <tr>
              <td>Scheduled Appointments</td>
              ${campusIds.map(cid => `<td>${reports[cid].appointment_visits || 0}</td>`).join('')}
            </tr>
            <tr class="grp"><td colspan="${campusIds.length + 1}">Patient Demographics (Student vs Personnel)</td></tr>
            <tr>
              <td><b>Unique Patients Served</b></td>
              ${campusIds.map(cid => `<td><b>${reports[cid].patients_served || 0}</b></td>`).join('')}
            </tr>
            <tr>
              <td>First-time Clients (in school year)</td>
              ${campusIds.map(cid => `<td>${reports[cid].first_time || 0}</td>`).join('')}
            </tr>
            <tr>
              <td>Returning Clients</td>
              ${campusIds.map(cid => `<td>${reports[cid].returning || 0}</td>`).join('')}
            </tr>
            <tr>
              <td><b>Students Served</b></td>
              ${campusIds.map(cid => `<td><span class="pill student">${reports[cid].by_type ? reports[cid].by_type.student : 0}</span></td>`).join('')}
            </tr>
            <tr>
              <td><b>Faculty Served</b></td>
              ${campusIds.map(cid => `<td><span class="pill personnel">${reports[cid].by_type ? reports[cid].by_type.faculty : 0}</span></td>`).join('')}
            </tr>
            <tr>
              <td><b>Personnel Served</b></td>
              ${campusIds.map(cid => `<td><span class="pill personnel">${reports[cid].by_type ? reports[cid].by_type.personnel : 0}</span></td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* =========================================================================
   DASHBOARDS (STAFF & DENTIST)
   ========================================================================= */

async function viewStaffHome() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const curMonth = todayStr.slice(0, 7);

  const [apptsData, refData, reportsData] = await Promise.all([
    api('/api/appointments'),
    api('/api/referrals'),
    api(`/api/reports/monthly?month=${curMonth}`)
  ]);

  const appts = apptsData.appointments || [];
  const pending = appts.filter(a => a.status === 'Pending');
  const todayAppts = appts.filter(a => a.date === todayStr && a.status === 'Approved');
  const openRefs = (refData.referrals || []).filter(r => r.status !== 'Completed');
  const rep = (reportsData.reports || {})[STATE.user.campus_id] || { visits_count: 0, consultations: 0, exams: 0, extractions: 0, referrals: 0, procedures: 0 };

  const monthSlices = [
    { label: 'Consultation', value: rep.consultations || 0, color: '#0284c7' },
    { label: 'Oral Examination', value: rep.exams || 0, color: '#0d9488' },
    { label: 'Tooth Extraction', value: rep.extractions || 0, color: '#e11d48' },
    { label: 'Dental Referral', value: rep.referrals || 0, color: '#f59e0b' },
    { label: 'Other Procedures', value: rep.procedures || 0, color: '#8b5cf6' }
  ];

  return `
    <div class="phead">
      <div>
        <h1>Clinic Management Dashboard</h1>
        <p>${esc(STATE.user.campus_name)} &bull; Real-time operations overview for ${fmtDate(todayStr, true)}.</p>
      </div>
      <div class="actions">
        <button class="btn" style="border-color:var(--bad);color:var(--bad);font-weight:700" onclick="openRecordVisitModal(null, 'Emergency Walk-in')">🚨 Log Emergency Walk-in</button>
        <button class="btn pri" onclick="go('appointments')">View All Requests (${pending.length})</button>
      </div>
    </div>

    <div class="grid g4">
      <button class="stat ${pending.length ? 'alert' : ''}" onclick="go('appointments')">
        <b>${pending.length}</b>
        <span>Pending Management Approval</span>
      </button>
      <div class="stat">
        <b>${todayAppts.length}</b>
        <span>Appointments Today</span>
      </div>
      <button class="stat" onclick="go('referrals')">
        <b>${openRefs.length}</b>
        <span>Open Dental Referrals</span>
      </button>
    </div>

    <!-- Live Services Distribution Pie Graph Card -->
    <div class="pie-card dashboard-service-card">
      <div class="pie-card-header">
        <div>
          <h3>📊 Monthly Services Distribution (${ymLabel(curMonth)})</h3>
          <p class="sub">Live breakdown of clinical services rendered at ${esc(STATE.user.campus_name)}</p>
        </div>
        <button class="btn sm" onclick="go('reports')">View Detailed Reports & Graphs &rarr;</button>
      </div>
      ${renderPieChartSvg(monthSlices, { size: 170 })}
    </div>

    <div class="grid g2 dashboard-followups">
      <div class="card">
        <h2>Requests Waiting for Management Approval</h2>
        ${pending.length ? pending.slice(0, 5).map(a => `
          <div class="item">
            <div>
              <div class="t">${esc(a.patient_name)} ${typePill(a.patient_type)}</div>
              <div class="s">${fmtDate(a.date, true)} at ${fmtTime(a.time)} &bull; ${esc(a.reason || 'Checkup')}</div>
            </div>
            <div class="actions">
              <button class="btn sm pri" onclick="handleApproveAppt('${a.id}')">Approve</button>
              <button class="btn sm danger" onclick="openDeclineModal('${a.id}')">Decline</button>
            </div>
          </div>
        `).join('') : '<div class="empty">No pending requests waiting for approval.</div>'}
      </div>

      <div class="card">
        <h2>Today's Scheduled Patients</h2>
        ${todayAppts.length ? todayAppts.map(a => `
          <div class="item">
            <div>
              <div class="t">${esc(a.patient_name)} ${typePill(a.patient_type)}</div>
              <div class="s">${fmtTime(a.time)} &bull; ${esc(a.reason || 'Checkup')}</div>
            </div>
            <div class="actions">
              <button class="btn sm" onclick="openPatientChart('${a.patient_id}')">Open Chart</button>
              <button class="btn sm pri" onclick="openRecordVisitModal('${a.patient_id}', 'Appointment')">Start Visit</button>
            </div>
          </div>
        `).join('') : '<div class="empty">No approved appointments scheduled for today.</div>'}
      </div>
    </div>
  `;
}

async function viewDentistHome() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const curMonth = todayStr.slice(0, 7);

  const [apptsData, patientsData, refData, reportsData] = await Promise.all([
    api('/api/appointments'),
    api('/api/patients'),
    api('/api/referrals'),
    api(`/api/reports/monthly?month=${curMonth}`)
  ]);

  const appts = apptsData.appointments || [];
  const today = appts.filter(a => a.date === todayStr && a.status === 'Approved');
  const pending = appts.filter(a => a.status === 'Pending');
  const patients = patientsData.patients || [];
  const unreviewed = patients.filter(p => !p.history_reviewed);
  const openRefs = (refData.referrals || []).filter(r => r.status !== 'Completed');
  const rep = (reportsData.reports || {})[STATE.user.campus_id] || { visits_count: 0, consultations: 0, exams: 0, extractions: 0, referrals: 0, procedures: 0 };

  const monthSlices = [
    { label: 'Consultation', value: rep.consultations || 0, color: '#0284c7' },
    { label: 'Oral Examination', value: rep.exams || 0, color: '#0d9488' },
    { label: 'Tooth Extraction', value: rep.extractions || 0, color: '#e11d48' },
    { label: 'Dental Referral', value: rep.referrals || 0, color: '#f59e0b' },
    { label: 'Other Procedures', value: rep.procedures || 0, color: '#8b5cf6' }
  ];

  return `
    <div class="phead">
      <div>
        <h1>Clinical Dashboard</h1>
        <p>${esc(STATE.user.campus_name)} &bull; Dr. ${esc(STATE.user.name.replace(/^Dr\.\s*/, ''))} &bull; ${fmtDate(todayStr, true)}</p>
      </div>
      <div class="actions">
        <button class="btn" style="border-color:var(--bad);color:var(--bad);font-weight:700" onclick="openRecordVisitModal(null, 'Emergency Walk-in')">🚨 Log Emergency Walk-in</button>
        <button class="btn pri" onclick="openRecordVisitModal()">Record Clinical Visit</button>
      </div>
    </div>

    <div class="grid g4">
      <div class="stat">
        <b>${today.length}</b>
        <span>Patients Booked Today</span>
      </div>
      <button class="stat ${pending.length ? 'alert' : ''}" onclick="go('appointments')">
        <b>${pending.length}</b>
        <span>Pending Approval</span>
      </button>
      <button class="stat ${unreviewed.length ? 'alert' : ''}" onclick="go('patients')">
        <b>${unreviewed.length}</b>
        <span>Histories Awaiting Review</span>
      </button>
      <button class="stat" onclick="go('referrals')">
        <b>${openRefs.length}</b>
        <span>Open Dental Referrals</span>
      </button>
    </div>

    <!-- Live Services Distribution Pie Graph Card -->
    <div class="pie-card dashboard-service-card">
      <div class="pie-card-header">
        <div>
          <h3>📊 Monthly Services Distribution (${ymLabel(curMonth)})</h3>
          <p class="sub">Breakdown of services performed at ${esc(STATE.user.campus_name)}</p>
        </div>
        <button class="btn sm" onclick="go('reports')">View Detailed Reports & Graphs &rarr;</button>
      </div>
      ${renderPieChartSvg(monthSlices, { size: 170 })}
    </div>

    <div class="grid g2 dashboard-followups">
      <div class="card">
        <h2>Today's Patients</h2>
        ${today.length ? today.map(a => `
          <div class="item">
            <div>
              <div class="t">${esc(a.patient_name)} ${typePill(a.patient_type)}</div>
              <div class="s">${fmtTime(a.time)} &bull; ${esc(a.reason || 'Consultation')}</div>
            </div>
            <div class="actions">
              <button class="btn sm" onclick="openPatientChart('${a.patient_id}')">Chart</button>
              <button class="btn sm pri" onclick="openRecordVisitModal('${a.patient_id}', 'Appointment')">Record Visit</button>
            </div>
          </div>
        `).join('') : '<div class="empty">No approved appointments scheduled today.</div>'}
      </div>

      <div class="card">
        <h2>Histories Updated by Patients</h2>
        ${unreviewed.length ? unreviewed.map(p => `
          <div class="item">
            <div>
              <div class="t">${esc(p.name)} ${typePill(p.type)}</div>
              <div class="s">Patient questionnaire modified &bull; Review required</div>
            </div>
            <button class="btn sm pri" onclick="openPatientChart('${p.id}', 'history')">Review</button>
          </div>
        `).join('') : '<div class="empty">All patient histories are reviewed.</div>'}
      </div>
    </div>
  `;
}

/* =========================================================================
   APPOINTMENTS MANAGEMENT (STAFF)
   ========================================================================= */

async function viewStaffAppointments() {
  const tab = getTab('staff_appts', 'requests');
  const catFilter = getTab('staff_appts_cat', 'all');

  const data = await api('/api/appointments');
  const appts = data.appointments || [];

  // Filter by student vs personnel if selected
  const studentAppts = appts.filter(a => a.patient_type === 'student');
  const personnelAppts = appts.filter(a => a.patient_type === 'personnel' || a.patient_type === 'faculty');

  let baseList = appts;
  if (catFilter === 'student') baseList = studentAppts;
  else if (catFilter === 'personnel') baseList = personnelAppts;

  const pending = baseList.filter(a => a.status === 'Pending');
  const approved = baseList.filter(a => a.status === 'Approved');
  const declinedOrCancelled = baseList.filter(a => a.status === 'Declined' || a.status === 'Cancelled');

  const displayList = tab === 'requests' ? pending : tab === 'approved' ? approved : tab === 'declined' ? declinedOrCancelled : baseList;

  return `
    <div class="phead">
      <div>
        <h1>Appointments & Management Approval</h1>
        <p>Review booking requests, manage clinic schedules, and record management approvals for student and personnel patients.</p>
      </div>
    </div>

    <!-- Category Filters: All, Students, Personnel -->
    <div class="filters" style="margin-bottom:12px">
      <div class="field" style="max-width:320px">
        <label>Filter by Patient Category</label>
        <select class="in" onchange="setTab('staff_appts_cat', this.value)">
          <option value="all" ${catFilter === 'all' ? 'selected' : ''}>All Categories (${appts.length})</option>
          <option value="student" ${catFilter === 'student' ? 'selected' : ''}>🎓 Students Only (${studentAppts.length})</option>
          <option value="personnel" ${catFilter === 'personnel' ? 'selected' : ''}>👔 Personnel & Faculty (${personnelAppts.length})</option>
        </select>
      </div>
    </div>

    <!-- Management Approval Tabs -->
    <div class="tabs">
      <button class="${tab === 'requests' ? 'on' : ''}" onclick="setTab('staff_appts','requests')">
        ⏳ Pending Management Approval (${pending.length})
      </button>
      <button class="${tab === 'approved' ? 'on' : ''}" onclick="setTab('staff_appts','approved')">
        ✅ Approved Schedule (${approved.length})
      </button>
      <button class="${tab === 'declined' ? 'on' : ''}" onclick="setTab('staff_appts','declined')">
        ❌ Declined & Cancelled (${declinedOrCancelled.length})
      </button>
      <button class="${tab === 'all' ? 'on' : ''}" onclick="setTab('staff_appts','all')">
        📋 All Bookings (${baseList.length})
      </button>
    </div>

    <div class="card">
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Patient Name</th>
              <th>Category</th>
              <th>Reason / Purpose</th>
              <th>Management Approval Status</th>
              <th>Direct Management Actions</th>
            </tr>
          </thead>
          <tbody>
            ${displayList.length ? displayList.map(a => `
              <tr>
                <td>
                  <b>${fmtDate(a.date, true)}</b>
                  <div class="muted small">${fmtTime(a.time)}</div>
                </td>
                <td>
                  <b>${esc(a.patient_name)}</b>
                  ${a.patient_phone ? `<div class="muted small">${esc(a.patient_phone)}</div>` : ''}
                </td>
                <td>${typePill(a.patient_type)}</td>
                <td>${esc(a.reason || 'General checkup & consultation')}</td>
                <td>
                  ${a.status === 'Pending' ? `
                    <span class="pill warn">Needs Approval</span>
                  ` : a.status === 'Approved' ? `
                    <span class="pill ok">Approved</span>
                    ${a.approved_by ? `<div class="muted small">By: ${esc(a.approved_by)}</div>` : ''}
                  ` : a.status === 'Declined' ? `
                    <span class="pill bad">Declined</span>
                    ${a.notes ? `<div class="muted small">${esc(a.notes)}</div>` : ''}
                  ` : apptPill(a.status)}
                </td>
                <td>
                  <div class="actions">
                    ${a.status === 'Pending' ? `
                      <button class="btn sm pri" onclick="handleApproveAppt('${a.id}')">Approve</button>
                      <button class="btn sm danger" onclick="openDeclineModal('${a.id}')">Decline</button>
                    ` : a.status === 'Approved' ? `
                      <button class="btn sm pri" onclick="openPatientChart('${a.patient_id}')">Open Chart</button>
                      <button class="btn sm" onclick="openRecordVisitModal('${a.patient_id}', 'Appointment')">Start Visit</button>
                      <button class="btn sm danger" onclick="cancelAppointment('${a.id}')">Cancel</button>
                    ` : `
                      <button class="btn sm" onclick="openPatientChart('${a.patient_id}')">Open Chart</button>
                    `}
                  </div>
                </td>
              </tr>
            `).join('') : `<tr><td colspan="6" class="empty">No appointments found in this view.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function handleApproveAppt(id) {
  confirmBox(
    'Approve Appointment',
    'Are you sure you want to approve this appointment? The patient will be notified.',
    'Approve Appointment',
    () => submitApproveAppt(id)
  );
}

async function submitApproveAppt(id) {
  try {
    await api(`/api/appointments/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'Approved' })
    });
    toast('Appointment approved. Patient notified.');
    render();
  } catch (err) {
    toast(err.message || 'Approval failed', true);
  }
}

function openDeclineModal(id) {
  const html = `
    <form class="form" onsubmit="handleDeclineSubmit(event, '${id}')">
      <div class="field">
        <label>Reason for Declining (Optional)</label>
        <input type="text" id="dc_reason" placeholder="e.g. Clinic closed for maintenance, dentist on leave">
      </div>
      <div class="actions" style="margin-top:14px">
        <button type="button" class="btn" onclick="closeModal()">Back</button>
        <button type="submit" class="btn danger">Decline Request</button>
      </div>
    </form>
  `;
  modal('Decline Appointment Request', html);
}

async function handleDeclineSubmit(e, id) {
  e.preventDefault();
  const reason = val('dc_reason');
  try {
    await api(`/api/appointments/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'Declined', reason })
    });
    toast('Appointment declined. Patient notified.');
    closeModal();
    render();
  } catch (err) {
    toast(err.message || 'Decline failed', true);
  }
}

/* =========================================================================
   SYSTEM SETUP (MAIN CAMPUS STAFF ONLY)
   ========================================================================= */

async function viewSetup() {
  if (STATE.user.role !== 'staff' || STATE.user.campus_id !== 'main') {
    return `<div class="empty">Access restricted to Main Campus Clinic Staff.</div>`;
  }

  const tab = getTab('setup', 'accounts');
  const [accountsData, servicesData] = await Promise.all([
    api('/api/setup/accounts'),
    api('/api/setup/services')
  ]);

  const accounts = accountsData.accounts || [];
  const services = servicesData.services || [];

  return `
    <div class="phead">
      <div>
        <h1>System Administration & Setup</h1>
        <p>Manage clinic staff logins, service catalog, and system parameters.</p>
      </div>
      <div class="actions">
        ${tab === 'accounts' ? `<button class="btn pri" onclick="openNewAccountModal()">Add Staff Account</button>` : ''}
        ${tab === 'services' ? `<button class="btn pri" onclick="openNewServiceModal()">Add Dental Service</button>` : ''}
      </div>
    </div>

    <div class="tabs">
      <button class="${tab === 'accounts' ? 'on' : ''}" onclick="setTab('setup','accounts')">Staff & Dentist Accounts (${accounts.length})</button>
      <button class="${tab === 'services' ? 'on' : ''}" onclick="setTab('setup','services')">Dental Services Catalog (${services.length})</button>
    </div>

    ${tab === 'accounts' ? `
      <div class="card">
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Campus</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              ${accounts.map(a => `
                <tr>
                  <td><b>${esc(a.name)}</b></td>
                  <td><code>${esc(a.username)}</code></td>
                  <td>${a.role === 'dentist' ? '<span class="pill info">Dentist</span>' : '<span class="pill pri">Staff</span>'}</td>
                  <td>${esc(a.campus_name)}</td>
                  <td>${a.active ? '<span class="pill ok">Active</span>' : '<span class="pill bad">Deactivated</span>'}</td>
                  <td>
                    <button class="btn sm ${a.active ? 'danger' : ''}" onclick="toggleAccount('${a.id}', ${a.active})">
                      ${a.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : `
      <div class="card">
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Service Name</th><th>Report Category</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              ${services.map(s => `
                <tr>
                  <td><b>${esc(s.name)}</b><div class="s muted small">${esc(s.description || '')}</div></td>
                  <td><span class="pill">${esc(s.category)}</span></td>
                  <td>${s.active ? '<span class="pill ok">Active</span>' : '<span class="pill">Hidden</span>'}</td>
                  <td>
                    <button class="btn sm" onclick="toggleService('${s.id}')">
                      ${s.active ? 'Hide' : 'Show'}
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `}
  `;
}

function openNewAccountModal() {
  const html = `
    <form class="form" onsubmit="handleCreateAccountSubmit(event)">
      <div class="field"><label>Full Name *</label><input type="text" id="ac_name" required></div>
      <div class="field"><label>Username *</label><input type="text" id="ac_user" required></div>
      <div class="fgrid">
        <div class="field">
          <label>Role *</label>
          <select class="in" id="ac_role">
            <option value="staff">Clinic Staff</option>
            <option value="dentist">Dentist</option>
          </select>
        </div>
        <div class="field">
          <label>Campus *</label>
          <select class="in" id="ac_campus">
            <option value="main">Main Campus</option>
            <option value="sa">Satellite Campus A</option>
            <option value="sb">Satellite Campus B</option>
          </select>
        </div>
      </div>
      <div class="field"><label>Initial Password *</label><input type="password" id="ac_pass" value="password123" required></div>
      <div class="actions" style="margin-top:14px">
        <button type="button" class="btn" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn pri">Create Account</button>
      </div>
    </form>
  `;
  modal('Add Staff / Dentist Account', html);
}

async function handleCreateAccountSubmit(e) {
  e.preventDefault();
  const payload = {
    name: val('ac_name'),
    username: val('ac_user'),
    role: val('ac_role'),
    campus_id: val('ac_campus'),
    password: val('ac_pass')
  };
  try {
    await api('/api/setup/accounts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    toast('Account created successfully.');
    closeModal();
    render();
  } catch (err) {
    toast(err.message || 'Creation failed', true);
  }
}

function toggleAccount(id, isActive) {
  const action = isActive ? 'deactivate' : 'activate';
  confirmBox(
    `${isActive ? 'Deactivate' : 'Activate'} Account`,
    `Are you sure you want to ${action} this account?`,
    `${isActive ? 'Deactivate' : 'Activate'} Account`,
    async () => {
      try {
        const res = await api(`/api/setup/accounts/${id}/toggle`, { method: 'PUT' });
        toast(res.message);
        render();
      } catch (err) {
        toast(err.message, true);
      }
    },
    isActive
  );
}

function openNewServiceModal() {
  const html = `
    <form class="form" onsubmit="handleCreateServiceSubmit(event)">
      <div class="field"><label>Service Name *</label><input type="text" id="sv_name" required></div>
      <div class="field">
        <label>Monthly Report Category *</label>
        <select class="in" id="sv_cat">
          <option value="Oral examination">Oral examination</option>
          <option value="Extraction">Extraction</option>
          <option value="Other procedure">Other procedure</option>
        </select>
      </div>
      <div class="field"><label>Description</label><input type="text" id="sv_desc"></div>
      <div class="actions" style="margin-top:14px">
        <button type="button" class="btn" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn pri">Save Service</button>
      </div>
    </form>
  `;
  modal('Add Dental Service', html);
}

async function handleCreateServiceSubmit(e) {
  e.preventDefault();
  const payload = {
    name: val('sv_name'),
    category: val('sv_cat'),
    description: val('sv_desc')
  };
  try {
    await api('/api/setup/services', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    toast('Service added to catalog.');
    closeModal();
    render();
  } catch (err) {
    toast(err.message || 'Creation failed', true);
  }
}

async function toggleService(id) {
  try {
    const res = await api(`/api/setup/services/${id}/toggle`, { method: 'PUT' });
    toast(res.message);
    render();
  } catch (err) {
    toast(err.message, true);
  }
}

// Announcements & Notifications Shared
async function viewAnnouncements() {
  const data = await api('/api/announcements');
  const list = data.announcements || [];
  const canPost = STATE.user.role === 'staff';

  return `
    <div class="phead">
      <div>
        <h1>Clinic Announcements</h1>
        <p>Official notices and oral health campaigns from the dental clinic.</p>
      </div>
      <div class="actions">
        ${canPost ? `<button class="btn pri" onclick="openNewAnnouncementModal()">Post Announcement</button>` : ''}
      </div>
    </div>

    ${list.length ? list.map(a => `
      <div class="card">
        <div class="phead" style="margin-bottom:8px">
          <h2>${esc(a.title)}</h2>
          ${canPost ? `<button class="btn sm danger" onclick="deleteAnnouncement('${a.id}')">Remove</button>` : ''}
        </div>
        <p style="white-space:pre-wrap;font-size:15px">${esc(a.body)}</p>
        <div class="s muted small">${fmtDate(a.date)} &bull; Posted by ${esc(a.by_name)} (${esc(a.campus_id === 'main' ? 'Main Campus' : a.campus_id)})</div>
      </div>
    `).join('') : '<div class="card"><div class="empty">No announcements posted.</div></div>'}
  `;
}

function openNewAnnouncementModal() {
  const html = `
    <form class="form" onsubmit="handlePostAnnouncement(event)">
      <div class="field"><label>Title *</label><input type="text" id="an_title" required></div>
      <div class="field"><label>Message *</label><textarea id="an_body" required></textarea></div>
      <div class="actions" style="margin-top:14px">
        <button type="button" class="btn" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn pri">Post to All Patients</button>
      </div>
    </form>
  `;
  modal('Post New Announcement', html);
}

async function handlePostAnnouncement(e) {
  e.preventDefault();
  const payload = {
    title: val('an_title'),
    body: val('an_body')
  };
  try {
    await api('/api/announcements', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    toast('Announcement broadcasted to all patients.');
    closeModal();
    render();
  } catch (err) {
    toast(err.message || 'Post failed', true);
  }
}

async function deleteAnnouncement(id) {
  confirmBox('Remove Announcement', 'Delete this announcement?', 'Yes, Remove', async () => {
    try {
      await api(`/api/announcements/${id}`, { method: 'DELETE' });
      toast('Announcement removed.');
      render();
    } catch (err) {
      toast(err.message, true);
    }
  }, true);
}

async function viewNotifications() {
  const data = await api('/api/notifications');
  const list = data.notifications || [];

  return `
    <div class="phead">
      <div>
        <h1>Alerts & System Notifications</h1>
        <p>In-system logs of appointment approvals, updates, and broadcasts.</p>
      </div>
      <div class="actions">
        <button class="btn" onclick="markAllNotificationsRead()">Mark All Read</button>
      </div>
    </div>

    <div class="card">
      <div class="list">
        ${list.length ? list.map(n => `
          <div class="item">
            <div>
              <div class="t">${esc(n.text)}</div>
              <div class="s">${fmtDate(n.date)} ${!n.is_read ? '<span class="pill bad">New</span>' : ''}</div>
            </div>
            ${n.email ? `<span class="pill info">Sent to ${esc(n.email)}</span>` : ''}
          </div>
        `).join('') : '<div class="empty">No alerts in your inbox.</div>'}
      </div>
    </div>
  `;
}

async function markAllNotificationsRead() {
  try {
    await api('/api/notifications/mark-read', { method: 'POST' });
    toast('All notifications marked as read.');
    render();
  } catch (err) {
    toast(err.message, true);
  }
}

// Dental Services Catalog View (Patient read-only)
async function viewDentalServices() {
  const data = await api('/api/setup/services');
  const services = (data.services || []).filter(s => s.active);

  return `
    <div class="phead">
      <div>
        <h1>Clinic Dental Services</h1>
        <p>Available procedures and examinations provided across university clinics.</p>
      </div>
      <div class="actions">
        ${STATE.user.role === 'patient' ? `<button class="btn pri" onclick="openBookModal()">Book Appointment</button>` : ''}
      </div>
    </div>

    <div class="grid g3">
      ${services.map(s => `
        <div class="card">
          <h3>${esc(s.name)}</h3>
          <span class="pill" style="margin:4px 0 10px">${esc(s.category)}</span>
          <p class="muted small" style="margin:0">${esc(s.description || 'Consult clinic staff for appointment eligibility.')}</p>
        </div>
      `).join('')}
    </div>
  `;
}

// Edit Patient Modal (Staff direct edit)
async function openEditPatientModal(id) {
  const data = await api(`/api/patients/${id}`);
  const p = data.patient;

  const html = `
    <form class="form" onsubmit="handleEditPatientSubmit(event, '${id}')">
      <div class="fgrid">
        <div class="field"><label>Full Name *</label><input type="text" id="ep_name" value="${esc(p.name)}" required></div>
        <div class="field"><label>ID Number *</label><input type="text" id="ep_id" value="${esc(p.id_no)}" required></div>
        <div class="field"><label>Email *</label><input type="email" id="ep_email" value="${esc(p.email)}" required></div>
        <div class="field"><label>Phone</label><input type="tel" id="ep_phone" value="${esc(p.phone || '')}"></div>
        <div class="field"><label>College / Program</label><input type="text" id="ep_unit" value="${esc(p.unit || '')}"></div>
        <div class="field"><label>Year / Position</label><input type="text" id="ep_level" value="${esc(p.level || '')}"></div>
      </div>
      <div class="actions" style="margin-top:14px">
        <button type="button" class="btn" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn pri">Save Patient Details</button>
      </div>
    </form>
  `;
  modal('Edit Patient Details', html);
}

async function handleEditPatientSubmit(e, id) {
  e.preventDefault();
  const payload = {
    name: val('ep_name'),
    id_no: val('ep_id'),
    email: val('ep_email'),
    phone: val('ep_phone'),
    unit: val('ep_unit'),
    level: val('ep_level')
  };
  try {
    await api(`/api/patients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    toast('Patient details updated.');
    closeModal();
    render();
  } catch (err) {
    toast(err.message || 'Update failed', true);
  }
}

async function deletePatient(id) {
  confirmBox('Delete Patient Record', 'Are you sure you want to permanently delete this patient, including their appointments, visits, and history?', 'Delete Record', async () => {
    try {
      await api(`/api/patients/${id}`, { method: 'DELETE' });
      toast('Patient deleted successfully.');
      render();
    } catch (err) {
      toast(err.message || 'Delete failed', true);
    }
  }, true);
}

let currentNewPatCategory = 'student';

function setNewPatCategory(cat) {
  currentNewPatCategory = cat;
  const isStudent = cat === 'student';
  const btnStud = document.getElementById('btn_np_student');
  const btnPers = document.getElementById('btn_np_personnel');
  if (btnStud) btnStud.className = isStudent ? 'active' : '';
  if (btnPers) btnPers.className = !isStudent ? 'active' : '';

  const dynArea = document.getElementById('np_dynamic_fields');
  if (dynArea) {
    dynArea.innerHTML = isStudent ? `
      <div class="field">
        <label>Student ID Number *</label>
        <input type="text" id="np_id" placeholder="e.g. 2026-01234" required>
      </div>
      <div class="field">
        <label>Degree Program / Course *</label>
        <input type="text" id="np_unit" placeholder="e.g. BS Nursing, BS IT, BS Accountancy" required>
      </div>
      <div class="field">
        <label>Year Level *</label>
        <select class="in" id="np_level" required>
          <option value="1st year">1st year</option>
          <option value="2nd year">2nd year</option>
          <option value="3rd year">3rd year</option>
          <option value="4th year">4th year</option>
          <option value="Graduate studies">Graduate studies</option>
        </select>
      </div>
    ` : `
      <div class="field">
        <label>Employee ID Number *</label>
        <input type="text" id="np_id" placeholder="e.g. EMP-10442" required>
      </div>
      <div class="field">
        <label>College / Office / Department *</label>
        <input type="text" id="np_unit" placeholder="e.g. College of Education, Registrar's Office, Maintenance" required>
      </div>
      <div class="field">
        <label>Classification & Position *</label>
        <div style="display:flex;gap:6px">
          <select class="in" id="np_pers_type" style="width:130px">
            <option value="faculty">Faculty</option>
            <option value="personnel">Personnel</option>
          </select>
          <input type="text" id="np_level" placeholder="e.g. Instructor, Records Officer..." style="flex:1" required>
        </div>
      </div>
    `;
  }
}

function openNewPatientModal() {
  currentNewPatCategory = 'student';
  const html = `
    <form class="form" onsubmit="handleNewPatientSubmit(event)">
      <div class="cat-switch">
        <button type="button" id="btn_np_student" class="active" onclick="setNewPatCategory('student')">
          <span>🎓 Student Record</span>
        </button>
        <button type="button" id="btn_np_personnel" onclick="setNewPatCategory('personnel')">
          <span>👔 Personnel / Faculty Record</span>
        </button>
      </div>

      <div class="fgrid">
        <div class="field"><label>Full Name *</label><input type="text" id="np_name" placeholder="Last, First, Middle" required></div>
        <div class="field"><label>Email Address *</label><input type="email" id="np_email" placeholder="patient@univ.example" required></div>
        <div class="field">
          <label>Sex</label>
          <select class="in" id="np_sex">
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </select>
        </div>
        <div class="field"><label>Birth Date</label><input type="date" id="np_birth" value="2004-01-01"></div>
        <div class="field"><label>Contact Phone</label><input type="tel" id="np_phone" placeholder="09XX XXX XXXX"></div>
        <div class="field">
          <label>Campus Clinic</label>
          <select class="in" id="np_campus">
            <option value="main" ${STATE.user.campus_id === 'main' ? 'selected' : ''}>Main Campus</option>
            <option value="sa" ${STATE.user.campus_id === 'sa' ? 'selected' : ''}>Satellite Campus A</option>
            <option value="sb" ${STATE.user.campus_id === 'sb' ? 'selected' : ''}>Satellite Campus B</option>
          </select>
        </div>
      </div>

      <!-- Dynamic category fields (Student ID / Course / Year vs Employee ID / Dept / Position) -->
      <div class="fgrid" id="np_dynamic_fields" style="margin-top:10px">
        <div class="field">
          <label>Student ID Number *</label>
          <input type="text" id="np_id" placeholder="e.g. 2026-01234" required>
        </div>
        <div class="field">
          <label>Degree Program / Course *</label>
          <input type="text" id="np_unit" placeholder="e.g. BS Nursing, BS IT, BS Accountancy" required>
        </div>
        <div class="field">
          <label>Year Level *</label>
          <select class="in" id="np_level" required>
            <option value="1st year">1st year</option>
            <option value="2nd year">2nd year</option>
            <option value="3rd year">3rd year</option>
            <option value="4th year">4th year</option>
            <option value="Graduate studies">Graduate studies</option>
          </select>
        </div>
      </div>

      <!-- Patient Dental & Medical History Section -->
      <h3 style="margin:16px 0 8px;font-size:14px;color:var(--pri)">🩺 Initial Medical & Dental History</h3>
      <div class="fgrid">
        <div class="field full">
          <label>Known Allergies (e.g. Penicillin, NSAIDs, Aspirin, Latex, None) *</label>
          <input type="text" id="np_all" value="None" required>
        </div>
        <div class="field full">
          <span class="lbl">Medical Conditions</span>
          <div class="checks" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px">
            <label><input type="checkbox" name="np_cond" value="Asthma"> Asthma</label>
            <label><input type="checkbox" name="np_cond" value="Diabetes"> Diabetes</label>
            <label><input type="checkbox" name="np_cond" value="High blood pressure"> High blood pressure</label>
            <label><input type="checkbox" name="np_cond" value="Heart condition"> Heart condition</label>
            <label><input type="checkbox" name="np_cond" value="Bleeding disorder"> Bleeding disorder</label>
            <label><input type="checkbox" name="np_cond" value="Kidney disease"> Kidney disease</label>
          </div>
        </div>
        <div class="field full">
          <label>Current Medications (or None)</label>
          <input type="text" id="np_meds" value="None">
        </div>
        <div class="field full">
          <span class="lbl">Past Dental Treatments</span>
          <div class="checks" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px">
            <label><input type="checkbox" name="np_past" value="Cleaning"> Cleaning</label>
            <label><input type="checkbox" name="np_past" value="Extraction"> Extraction</label>
            <label><input type="checkbox" name="np_past" value="Filling"> Filling</label>
            <label><input type="checkbox" name="np_past" value="Braces"> Braces</label>
            <label><input type="checkbox" name="np_past" value="Root canal"> Root canal</label>
          </div>
        </div>
      </div>

      <div class="actions" style="margin-top:16px">
        <button type="button" class="btn" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn pri">Save Patient Record</button>
      </div>
    </form>
  `;
  modal('Manual Input Patient Record', html, true);
}

async function handleNewPatientSubmit(e) {
  e.preventDefault();
  let finalType = currentNewPatCategory;
  if (currentNewPatCategory === 'personnel') {
    const persSelect = document.getElementById('np_pers_type');
    finalType = persSelect ? persSelect.value : 'personnel';
  }

  const payload = {
    name: val('np_name'),
    type: finalType,
    id_no: val('np_id'),
    email: val('np_email'),
    sex: val('np_sex'),
    birth: val('np_birth'),
    unit: val('np_unit'),
    level: val('np_level'),
    phone: val('np_phone'),
    campus_id: val('np_campus') || STATE.user.campus_id,
    allergies: val('np_all') || 'None',
    conditions: checked('np_cond'),
    medications: val('np_meds') || 'None',
    past_treatment: checked('np_past')
  };

  try {
    const res = await api('/api/patients', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    toast('Patient record created successfully!');
    closeModal();
    render();
    if (res && res.id) {
      openPatientChart(res.id, 'profile');
    }
  } catch (err) {
    toast(err.message || 'Creation failed', true);
  }
}

/* =========================================================================
   MAIN APP RENDERER
   ========================================================================= */

async function render() {
  const currentRenderVersion = ++renderVersion;
  const appEl = document.getElementById('app');
  if (!appEl) return;
  const activeElement = document.activeElement;
  const searchFocus = activeElement && ['q_pat', 'v_search'].includes(activeElement.id)
    ? {
        id: activeElement.id,
        selectionStart: activeElement.selectionStart,
        selectionEnd: activeElement.selectionEnd
      }
    : null;

  // Unauthenticated -> Show Login or Registration screen
  if (!STATE.token || !STATE.user) {
    appEl.innerHTML = renderAuth();
    return;
  }

  // Role routing
  const u = STATE.user;
  const navItems = navFor(u);
  const curRoute = STATE.route;

  const navHtml = navItems.map(item => {
    if (item.grp) return `<div class="navgrp">${item.grp}</div>`;
    const [rKey, label, iconName] = item;
    const isActive = (curRoute === rKey) || (rKey === 'patients' && curRoute === 'chart');
    return `
      <button class="${isActive ? 'on' : ''}" onclick="go('${rKey}')" ${isActive ? 'aria-current="page"' : ''}>
        ${ic(iconName)}
        <span>${esc(label)}</span>
      </button>
    `;
  }).join('');

  // Main View Content Resolver
  let viewHtml = '<div class="empty">Loading...</div>';
  try {
    if (u.role === 'patient') {
      if (curRoute === 'home') viewHtml = await viewPatientHome();
      else if (curRoute === 'appointments') viewHtml = await viewPatientAppointments();
      else if (curRoute === 'records') viewHtml = await viewPatientRecords();
      else if (curRoute === 'services') viewHtml = await viewDentalServices();
      else if (curRoute === 'announcements') viewHtml = await viewAnnouncements();
      else if (curRoute === 'notifications') viewHtml = await viewNotifications();
      else viewHtml = await viewPatientHome();
    } else if (u.role === 'dentist') {
      if (curRoute === 'home') viewHtml = await viewDentistHome();
      else if (curRoute === 'appointments') viewHtml = await viewStaffAppointments();
      else if (curRoute === 'patients') viewHtml = await viewPatients();
      else if (curRoute === 'chart') viewHtml = await viewPatientChart();
      else if (curRoute === 'visits') viewHtml = await viewVisits();
      else if (curRoute === 'referrals') viewHtml = await viewReferrals();
      else if (curRoute === 'reports') viewHtml = await viewReports();
      else viewHtml = await viewDentistHome();
    } else {
      // Staff
      if (curRoute === 'home') viewHtml = await viewStaffHome();
      else if (curRoute === 'appointments') viewHtml = await viewStaffAppointments();
      else if (curRoute === 'patients') viewHtml = await viewPatients();
      else if (curRoute === 'chart') viewHtml = await viewPatientChart();
      else if (curRoute === 'visits') viewHtml = await viewVisits();
      else if (curRoute === 'referrals') viewHtml = await viewReferrals();
      else if (curRoute === 'reports') viewHtml = await viewReports();
      else if (curRoute === 'announcements') viewHtml = await viewAnnouncements();
      else if (curRoute === 'setup') viewHtml = await viewSetup();
      else viewHtml = await viewStaffHome();
    }
  } catch (err) {
    viewHtml = `<div class="callout bad">Error loading view: ${esc(err.message)}</div>`;
  }

  if (currentRenderVersion !== renderVersion) return;

  appEl.innerHTML = `
    <div class="app role-${esc(u.role)}">
      <aside class="side" id="sidebar">
        <div class="brand">
          <div class="mark">${ic('tooth')}</div>
          <div>
            <b>University Dental Clinic</b>
            <span>${esc(u.campus_name)}</span>
          </div>
        </div>
        <nav class="nav" aria-label="Main Navigation">${navHtml}</nav>
        <div class="sidefoot">
          <div class="u-info">${esc(u.name)}</div>
          <div class="small">${esc(u.role === 'staff' ? 'Clinic Staff' : u.role === 'dentist' ? 'Dentist' : 'Patient')}</div>
        </div>
      </aside>

      <div class="main">
        <header class="top">
          <button class="iconbtn menu" onclick="toggleSidebar()" aria-label="Toggle navigation">${ic('menu')}</button>
          <div class="user-badge">
            <span class="u-name">${esc(u.name)}</span>
            <span class="role-indicator ${esc(u.role)}">${u.role === 'staff' ? 'Clinic Staff' : u.role === 'dentist' ? 'Dentist' : 'Patient'}</span>
            <span class="muted small">${esc(u.campus_name)}</span>
          </div>
          <div class="grow"></div>
          <button class="btn sm danger logout-btn" onclick="logout()" title="Sign out">${ic('logout')} Log Out</button>
          ${themeToggleMarkup()}
        </header>

        <main class="view${curRoute === 'visits' ? ' visits-page' : ''}" id="main_view">${viewHtml}</main>
      </div>
    </div>
  `;

  if (searchFocus) {
    const searchInput = document.getElementById(searchFocus.id);
    if (searchInput) {
      searchInput.focus({ preventScroll: true });
      searchInput.setSelectionRange(searchFocus.selectionStart, searchFocus.selectionEnd);
    }
  }
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  if (sb) sb.classList.toggle('open');
}

// App Initialization
async function initApp() {
  if (STATE.token) {
    try {
      const data = await api('/api/auth/me');
      STATE.user = data.user;
    } catch {
      STATE.token = null;
      STATE.user = null;
      localStorage.removeItem('clinic_token');
    }
  }
  render();
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (themePreference === 'system') applyTheme();
});

if (document.readyState === 'loading') {
  applyTheme();
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  applyTheme();
  initApp();
}
