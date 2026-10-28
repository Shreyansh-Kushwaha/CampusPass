/* CampusPass shared frontend utilities (vanilla JS, no dependencies). */
(function () {
  'use strict';

  const state = { user: null, csrfToken: null, ready: null };

  // ---------- Helpers ----------
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children)) {
      if (c === null || c === undefined) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }
  function qs(sel, root = document) { return root.querySelector(sel); }
  function params() { return new URLSearchParams(location.search); }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso, opts = {}) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', ...opts });
  }
  function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function fmtDateTime(iso) { return iso ? `${fmtDate(iso)} · ${fmtTime(iso)}` : '—'; }
  function fmtShort(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function dateBlock(iso) {
    const d = new Date(iso);
    return el('div', { class: 'event-date' }, [el('span', { class: 'd' }, d.getDate()), el('span', { class: 'm' }, MONTHS[d.getMonth()])]);
  }
  // Convert ISO -> value for <input type="datetime-local"> in local time.
  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const AVAIL_LABEL = { open: 'Open', full: 'Full', closed: 'Closed', cancelled: 'Cancelled', ended: 'Ended', draft: 'Draft' };
  function availabilityBadge(a) { return el('span', { class: `badge badge-${a}` }, AVAIL_LABEL[a] || a); }
  function statusBadge(s) { return el('span', { class: `badge badge-${s}` }, s.charAt(0).toUpperCase() + s.slice(1)); }

  const ICONS = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z"/><path d="M13 5v14" stroke-dasharray="2 2"/></svg>',
  };

  // ---------- API ----------
  async function api(path, { method = 'GET', body, raw = false } = {}) {
    await state.ready;
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && state.csrfToken) headers['X-CSRF-Token'] = state.csrfToken;
    const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    if (raw) return res;
    let data = null;
    try { data = await res.json(); } catch (_) { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  async function loadSession() {
    try {
      const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
      const data = await res.json();
      state.user = data.user; state.csrfToken = data.csrfToken;
    } catch (_) { state.user = null; }
    return state.user;
  }

  // ---------- Toasts ----------
  function toast(message, type = 'info', ms = 3800) {
    let stack = qs('.toast-stack');
    if (!stack) { stack = el('div', { class: 'toast-stack' }); document.body.append(stack); }
    const t = el('div', { class: `toast toast-${type}`, role: 'status' }, message);
    stack.append(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, ms);
  }

  // ---------- Nav & footer ----------
  function renderNav() {
    const nav = qs('#nav');
    if (!nav) return;
    const user = state.user;
    const page = location.pathname.replace(/\.html$/, '').replace(/^\//, '') || 'index';
    const link = (href, label, key) => el('li', {}, el('a', { href, class: page === key ? 'active' : '' }, label));

    const links = [link('/', 'Home', 'index'), link('/events', 'Events', 'events')];
    if (user && user.role === 'student') links.push(link('/student-dashboard', 'My Tickets', 'student-dashboard'));
    if (user && user.role === 'admin') {
      links.push(link('/admin-dashboard', 'Admin', 'admin-dashboard'), link('/admin-checkin', 'Check-in', 'admin-checkin'));
    }

    const actions = [];
    if (user) {
      actions.push(el('span', { class: 'nav-user' }, ['Signed in as ', el('strong', {}, user.full_name.split(' ')[0])]));
      actions.push(el('button', { class: 'btn btn-ghost btn-sm', onclick: logout }, 'Log out'));
    } else {
      actions.push(el('a', { href: '/login', class: 'btn btn-ghost btn-sm' }, 'Log in'));
      actions.push(el('a', { href: '/register', class: 'btn btn-primary btn-sm' }, 'Create account'));
    }

    const menu = el('div', { class: 'nav-menu', id: 'navMenu' }, [el('ul', { class: 'nav-links' }, links), el('div', { class: 'nav-actions' }, actions)]);
    const toggle = el('button', { class: 'nav-toggle', 'aria-label': 'Toggle menu', onclick: () => menu.classList.toggle('open') }, [el('span'), el('span'), el('span')]);

    nav.innerHTML = '';
    nav.append(el('div', { class: 'container nav-inner' }, [
      el('a', { href: '/', class: 'brand' }, [el('span', { class: 'brand-mark' }), 'CampusPass']),
      menu, toggle,
    ]));
  }

  function renderFooter() {
    const f = qs('#footer');
    if (!f) return;
    f.className = 'footer';
    f.innerHTML = `
      <div class="container">
        <div class="footer-grid">
          <div>
            <a href="/" class="brand"><span class="brand-mark"></span>CampusPass</a>
            <p style="margin-top:1rem">The college's home for events, registrations and digital tickets. Discover what's happening on campus and never miss a moment.</p>
          </div>
          <div>
            <h4>Explore</h4>
            <ul><li><a href="/events">All events</a></li><li><a href="/events?category=Cultural">Cultural</a></li><li><a href="/events?category=Technical">Technical</a></li><li><a href="/events?category=Workshop">Workshops</a></li></ul>
          </div>
          <div>
            <h4>Account</h4>
            <ul id="footerAccount"></ul>
          </div>
        </div>
        <div class="footer-bottom"><span>© ${new Date().getFullYear()} CampusPass · College Event Management</span><span class="script" style="font-size:1.25rem">Every event, one pass.</span></div>
      </div>`;
    const acc = qs('#footerAccount', f);
    if (state.user) {
      acc.append(el('li', {}, el('a', { href: state.user.role === 'admin' ? '/admin-dashboard' : '/student-dashboard' }, 'Dashboard')));
      acc.append(el('li', {}, el('button', { class: 'btn-link', onclick: logout }, 'Log out')));
    } else {
      acc.append(el('li', {}, el('a', { href: '/login' }, 'Log in')), el('li', {}, el('a', { href: '/register' }, 'Create account')));
    }
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) { /* ignore */ }
    location.href = '/';
  }

  // Redirect helpers for protected pages.
  function requireRole(role) {
    if (!state.user) { location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return false; }
    if (role && state.user.role !== role) {
      location.replace(state.user.role === 'admin' ? '/admin-dashboard' : '/student-dashboard');
      return false;
    }
    return true;
  }

  // ---------- Event card ----------
  function eventCard(ev) {
    const pct = Math.min(100, Math.round((ev.registered_count / ev.capacity) * 100));
    const meta = el('div', { class: 'event-meta' }, [
      el('span', { html: `${ICONS.clock}<span>${esc(fmtDate(ev.start_datetime, { weekday: undefined }))} · ${esc(fmtTime(ev.start_datetime))}</span>` }),
      el('span', { html: `${ICONS.pin}<span>${esc(ev.venue)}</span>` }),
    ]);
    const card = el('article', { class: 'event-card' }, [
      el('div', { class: 'event-card-top' }, [dateBlock(ev.start_datetime), availabilityBadge(ev.availability)]),
      el('div', { class: 'event-card-body' }, [
        el('span', { class: 'badge badge-category' }, ev.category),
        el('h3', {}, el('a', { href: `/event?id=${ev.id}` }, ev.title)),
        meta,
        el('p', { class: 'event-excerpt' }, ev.description),
        el('div', { class: 'event-card-foot' }, [
          el('div', { class: 'seats' }, [
            el('span', { html: `<strong>${ev.seats_left}</strong> of ${ev.capacity} seats left` }),
            el('div', { class: 'capacity-bar' }, el('i', { style: `width:${pct}%` })),
          ]),
          el('a', { href: `/event?id=${ev.id}`, class: 'btn btn-outline btn-sm' }, ev.availability === 'open' ? 'Register' : 'Details'),
        ]),
      ]),
    ]);
    return card;
  }

  function emptyState({ title, text, action, script = 'Nothing here yet' }) {
    const wrap = el('div', { class: 'empty' }, [
      el('span', { class: 'script' }, script),
      el('h3', {}, title),
      el('p', {}, text),
    ]);
    if (action) wrap.append(el('a', { href: action.href, class: 'btn btn-primary' }, action.label));
    return wrap;
  }

  // Form helpers: set field errors and gather form data.
  function formData(form) {
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = typeof v === 'string' ? v : ''; });
    return data;
  }
  function showAlert(container, message, type = 'error') {
    container.innerHTML = '';
    if (!message) return;
    container.append(el('div', { class: `alert alert-${type}`, role: 'alert' }, message));
  }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Please wait…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  function confirmModal({ title, text, confirmLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      const close = (v) => { backdrop.remove(); resolve(v); };
      const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(false); } }, [
        el('div', { class: 'modal', style: 'max-width:460px', role: 'dialog', 'aria-modal': 'true' }, [
          el('div', { class: 'modal-head' }, [el('h3', {}, title), el('button', { class: 'modal-close', 'aria-label': 'Close', onclick: () => close(false) }, '×')]),
          el('div', { class: 'modal-body' }, [
            el('p', {}, text),
            el('div', { class: 'form-actions' }, [
              el('button', { class: 'btn btn-ghost', onclick: () => close(false) }, 'Cancel'),
              el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => close(true) }, confirmLabel),
            ]),
          ]),
        ]),
      ]);
      document.body.append(backdrop);
    });
  }

  // Boot: load session then render chrome, then signal page scripts.
  state.ready = loadSession().then(() => { renderNav(); renderFooter(); });

  window.CP = {
    state, api, esc, el, qs, params, fmtDate, fmtTime, fmtDateTime, fmtShort, dateBlock, toLocalInput,
    availabilityBadge, statusBadge, ICONS, toast, requireRole, eventCard, emptyState, formData, showAlert, busy, confirmModal, logout,
    ready: () => state.ready,
  };
})();
