/* FlatKhata Pro: web app. Vanilla JS, no build step. The server is the source of truth. */
(function () {
  'use strict';

  // ---------- Constants ----------

  const CATEGORIES = [
    ['Sabzi & Vegetables', 'Sabzi & veg'],
    ['Ration & Staples', 'Atta, rice & dal'],
    ['Oil & Spices', 'Oil & masala'],
    ['Dairy & Morning', 'Milk & dairy'],
    ['LPG Gas & Utility', 'Gas & utilities'],
  ];
  const CATEGORY_LABEL = Object.fromEntries(CATEGORIES);

  const PRESETS = [
    { label: 'Aloo, pyaz, tamatar', item: 'Aloo, pyaz, tamatar', category: 'Sabzi & Vegetables', amount: 180 },
    { label: 'Green sabzi', item: 'Gobhi, matar, bhindi', category: 'Sabzi & Vegetables', amount: 220 },
    { label: 'Milk, bread & dahi', item: 'Milk, bread & dahi', category: 'Dairy & Morning', amount: 160 },
    { label: 'Atta, rice & dal', item: 'Atta, rice & dal', category: 'Ration & Staples', amount: 650 },
    { label: 'Mustard oil & masala', item: 'Mustard oil & masala', category: 'Oil & Spices', amount: 420 },
    { label: 'LPG cylinder', item: 'LPG cylinder refill', category: 'LPG Gas & Utility', amount: 950 },
  ];

  const svg = (body) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const ICON = {
    home: svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>'),
    book: svg('<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v16H6.5A1.5 1.5 0 0 0 5 20.5z"/><path d="M5 20.5V4.5"/><path d="M9 8h6"/>'),
    scale: svg('<path d="M12 4v16"/><path d="M7 20h10"/><path d="M5 7h14"/><path d="M7.5 7 4.5 13.5h6z"/><path d="M16.5 7l-3 6.5h6z"/>'),
    plane: svg('<path d="M3 12 21 4l-6 17-3-7-9-2z"/>'),
    camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    minus: svg('<path d="M5 12h14"/>'),
    left: svg('<path d="m15 6-6 6 6 6"/>'),
    right: svg('<path d="m9 6 6 6-6 6"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    share: svg('<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 13v7h14v-7"/>'),
    download: svg('<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>'),
  };

  const TABS = [
    ['home', 'Home', 'home'],
    ['khata', 'Khata', 'book'],
    ['hisab', 'Hisab', 'scale'],
    ['leave', 'Leave', 'plane'],
    ['me', 'Me', null],
  ];

  // ---------- State ----------

  const state = {
    token: localStorage.getItem('fk_token') || '',
    me: null,
    members: [],
    loginId: '',
    month: '',
    data: null,
    tab: 'home',
    feed: 'all',
    khata: { member: 'ALL', category: 'ALL', search: '', sort: 'date' },
    editingId: null,
    form: null,
    receipt: { mode: 'none' },
    pendingConfirm: null,
  };

  // ---------- Helpers ----------

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const inr = (n, dp = 0) => {
    const v = Number(n) || 0;
    return (v < 0 ? '-₹' : '₹') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  };
  const rateText = (r) => inr(r, r % 1 ? 2 : 0);
  const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const fmtDateTime = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const shortMonth = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  };
  const shiftMonthClient = (ym, delta) => {
    const [y, m] = ym.split('-').map(Number);
    const t = y * 12 + (m - 1) + delta;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  };
  const catLabel = (v) => CATEGORY_LABEL[v] || v;
  const emptyState = (msg) => `<p class="empty">${esc(msg)}</p>`;
  const memberById = (id) => (state.data ? state.data.members.find((m) => m.id === id) : null);
  const myStat = () => state.data.members.find((m) => m.id === state.data.me.id);
  const editingExpense = () => (state.editingId && state.data ? state.data.expenses.find((e) => e.id === state.editingId) : null);

  function avatar(m, extra = '') {
    if (!m) return '';
    if (m.avatar) return `<img class="av ${extra}" src="${esc(m.avatar)}" alt="" />`;
    const initials = esc(String(m.name || '?').slice(0, 2).toUpperCase());
    return `<span class="av ${extra}" style="--av:${esc(m.color || '#6b5d4a')}" aria-hidden="true">${initials}</span>`;
  }

  // ---------- Network & session ----------

  async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;

    let res;
    try {
      res = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error('Cannot reach the server. Check the Wi-Fi or the server address.');
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 401 && state.token && path !== '/api/auth/login') {
      clearSession();
      showLogin();
      throw new Error(data.error || 'Please sign in again.');
    }
    if (!res.ok) {
      const err = new Error(data.error || `Something went wrong (${res.status}).`);
      err.code = data.code;
      throw err;
    }
    return data;
  }

  function saveSession(token) {
    state.token = token;
    localStorage.setItem('fk_token', token);
  }

  function clearSession() {
    state.token = '';
    state.me = null;
    state.data = null;
    localStorage.removeItem('fk_token');
  }

  // ---------- Feedback ----------

  function toast(message, kind = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.textContent = message;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('toast-out'), 2600);
    setTimeout(() => el.remove(), 3000);
  }

  async function run(fn, successMsg) {
    try {
      const out = await fn();
      if (successMsg) toast(successMsg, 'success');
      return out;
    } catch (err) {
      toast(err.message, 'error');
      return null;
    }
  }

  function formError(form, message) {
    let el = form.querySelector('.form-error');
    if (!el) {
      el = document.createElement('p');
      el.className = 'form-error';
      el.setAttribute('role', 'alert');
      form.prepend(el);
    }
    el.textContent = message;
  }

  function clearFormError(form) {
    const el = form.querySelector('.form-error');
    if (el) el.remove();
  }

  function openModal(html) {
    $('#modalRoot').innerHTML = `
      <div class="modal-backdrop" data-action="backdrop">
        <div class="modal" role="dialog" aria-modal="true">${html}</div>
      </div>`;
    document.body.classList.add('no-scroll');
    const first = $('#modalRoot .modal input') || $('#modalRoot .modal .btn-primary') || $('#modalRoot .modal .btn');
    if (first) first.focus();
  }

  function closeModal() {
    $('#modalRoot').innerHTML = '';
    document.body.classList.remove('no-scroll');
    if (state.pendingConfirm) {
      const resolve = state.pendingConfirm;
      state.pendingConfirm = null;
      resolve(false);
    }
  }

  function askConfirm({ title, body, okLabel, danger = false }) {
    return new Promise((resolve) => {
      state.pendingConfirm = resolve;
      openModal(`
        <h3>${esc(title)}</h3>
        <p class="muted">${esc(body)}</p>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" data-action="confirm-no">Cancel</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm-yes">${esc(okLabel)}</button>
        </div>`);
    });
  }

  // ---------- Boot & screens ----------

  async function boot() {
    if (!state.token) return showLogin();
    try {
      const { user } = await api('/api/me');
      state.me = user;
    } catch (err) {
      if (state.token) showError(err.message);
      return;
    }
    if (state.me.mustChangePassword) return showForceChange();
    try {
      await loadMonth('');
    } catch (err) {
      showError(err.message);
    }
  }

  function showError(message) {
    $('#app').innerHTML = `
      <div class="splash">
        <p>${esc(message)}</p>
        <button type="button" class="btn btn-primary" data-action="retry">Try again</button>
      </div>`;
  }

  async function showLogin() {
    state.me = null;
    state.data = null;
    if (!state.members.length) {
      try {
        state.members = await api('/api/members');
      } catch (err) {
        showError(err.message);
        return;
      }
    }
    if (!state.members.some((m) => m.id === state.loginId)) {
      state.loginId = state.members[0] ? state.members[0].id : '';
    }
    const picks = state.members.map((m) => {
      const on = m.id === state.loginId;
      return `
        <button type="button" class="member-pick ${on ? 'is-on' : ''}" aria-pressed="${on}" data-action="pick-member" data-id="${esc(m.id)}">
          ${avatar(m)}<span>${esc(m.name)}</span>
        </button>`;
    }).join('');

    $('#app').innerHTML = `
      <main class="auth">
        <div class="auth-card">
          <div class="brand brand-lg"><span class="brand-mark" aria-hidden="true">₹</span><span>FlatKhata Pro</span></div>
          <div>
            <h1>Who is signing in?</h1>
            <p class="muted">Pick your name, then enter your password.</p>
          </div>
          <div class="member-grid" role="group" aria-label="Your name">${picks}</div>
          <form data-form="login" class="stack">
            <label class="field"><span class="label">Password</span>
              <input name="password" type="password" required autocomplete="current-password" /></label>
            <div style="display:flex;justify-content:flex-end;margin:-4px 0 6px">
              <button type="button" class="link-btn small" data-action="forgot-password">Forgot password?</button>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Sign in</button>
          </form>
          <p class="muted small">First time here? Use the temporary password from your welcome email. You will choose your own next.</p>
        </div>
      </main>`;
  }

  function showForceChange() {
    $('#app').innerHTML = `
      <main class="auth">
        <div class="auth-card">
          <div class="brand"><span class="brand-mark" aria-hidden="true">₹</span><span>FlatKhata Pro</span></div>
          <div>
            <p class="muted">Hi ${esc(state.me.name)}</p>
            <h1>Choose your own password</h1>
          </div>
          <p class="muted small">You signed in with a temporary password. Pick one that only you know. Use at least 8 characters, with letters and numbers. No one else in the flat can use it.</p>
          <form data-form="password" class="stack">
            <label class="field"><span class="label">Temporary password</span>
              <input name="currentPassword" type="password" required autocomplete="current-password" /></label>
            <label class="field"><span class="label">New password</span>
              <input name="newPassword" type="password" required minlength="8" autocomplete="new-password" /></label>
            <label class="field"><span class="label">Repeat new password</span>
              <input name="confirm" type="password" required minlength="8" autocomplete="new-password" /></label>
            <button type="submit" class="btn btn-primary btn-block">Save and continue</button>
          </form>
          <button type="button" class="link-btn" data-action="sign-out">Sign out</button>
        </div>
      </main>`;
  }

  async function loadMonth(ym) {
    const qs = ym ? `?month=${encodeURIComponent(ym)}` : '';
    state.data = await api(`/api/dashboard${qs}`);
    state.month = state.data.month;
    state.me = state.data.me;
    render();
  }

  async function refresh() {
    try {
      await loadMonth(state.month);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function goMonth(ym) {
    try {
      await loadMonth(ym);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- Layout ----------

  function render() {
    const views = { home: homeView, khata: khataView, hisab: hisabView, leave: leaveView, me: meView };
    $('#app').innerHTML = `
      <div class="app">
        ${topBar()}
        <main class="main" id="main">${views[state.tab]()}</main>
      </div>
      ${tabbar()}`;
  }

  function topBar() {
    const d = state.data;
    return `
      <header class="topbar">
        <div class="brand"><span class="brand-mark" aria-hidden="true">₹</span><span>FlatKhata</span></div>
        <div class="monthnav" role="group" aria-label="Choose month">
          <button type="button" class="icon-btn" data-action="month" data-delta="-1" aria-label="Previous month">${ICON.left}</button>
          <span class="monthlabel">${esc(d.label)}</span>
          <button type="button" class="icon-btn" data-action="month" data-delta="1" aria-label="Next month">${ICON.right}</button>
        </div>
      </header>`;
  }

  function tabbar() {
    const d = state.data;
    const items = TABS.map(([id, label, icon]) => {
      const active = state.tab === id;
      const glyph = id === 'me' ? avatar(d.me, 'av-sm') : ICON[icon];
      return `
        <button type="button" class="tab ${active ? 'is-active' : ''}" data-action="tab" data-tab="${id}" ${active ? 'aria-current="page"' : ''}>
          ${glyph}<span>${label}</span>
        </button>`;
    }).join('');
    return `<nav class="tabbar" aria-label="Sections">${items}</nav>`;
  }

  // ---------- Home: statement, add purchase, recent feed ----------

  function homeView() {
    const d = state.data;
    const m = myStat();
    const net = Math.round(m.net);
    const tone = net > 0 ? 'owed' : net < 0 ? 'owes' : 'even';
    const label = net > 0 ? 'You get back' : net < 0 ? 'You owe' : "You're square";
    const days = m.daysAway ? `${m.daysAway} (${m.exempt ? 'deducted' : 'no cut'})` : 'None';

    return `
      <section class="statement" aria-labelledby="statementLabel">
        <p class="statement-kicker">${esc(d.me.name)} · ${esc(d.label)}</p>
        <h2 id="statementLabel" class="statement-label">${label}</h2>
        <p class="statement-amount ${tone}">${inr(Math.abs(net))}</p>
        <p class="statement-note">Your share is ${inr(Math.round(m.fairShare))} for ${m.activeDays} active days at ${rateText(d.summary.ratePerDay)} a day.</p>
        <dl class="facts">
          <div><dt>You paid</dt><dd>${inr(m.paid)}</dd></div>
          <div><dt>Your share</dt><dd>${inr(Math.round(m.fairShare))}</dd></div>
          <div><dt>Days away</dt><dd>${esc(days)}</dd></div>
        </dl>
        <p class="statement-note"><button type="button" class="link-btn" data-action="tab" data-tab="hisab">See who pays whom</button></p>
      </section>
      ${composerHtml()}
      ${feedHtml()}`;
  }

  function defaultDate() {
    if (state.form && state.form.date) return state.form.date;
    if (state.data.isCurrentMonth) return state.data.today;
    const [y, m] = state.month.split('-').map(Number);
    return `${state.month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  }

  function composerHtml() {
    const d = state.data;
    const editing = editingExpense();
    const f = state.form || {};
    const value = (k) => (f[k] === undefined || f[k] === null ? '' : esc(f[k]));
    const chosenCategory = f.category || CATEGORIES[0][0];

    return `
      <section class="composer" id="composer" aria-labelledby="composerHead">
        <div class="section-head">
          <h2 id="composerHead">${editing ? 'Edit purchase' : 'Add a purchase'}</h2>
          <span class="muted small">Recording as ${esc(d.me.name)}</span>
        </div>
        ${editing ? '' : `
          <div class="presets" aria-label="Quick presets">
            ${PRESETS.map((p, i) => `<button type="button" class="chip" data-action="preset" data-index="${i}">${esc(p.label)} <b>${inr(p.amount)}</b></button>`).join('')}
          </div>`}
        <form data-form="expense" class="stack">
          <label class="field amount-field">
            <span class="label">Amount</span>
            <span class="amount-input">
              <span class="rupee" aria-hidden="true">₹</span>
              <input name="amount" type="number" inputmode="numeric" min="1" max="100000" step="1" placeholder="0" required value="${value('amount')}" />
            </span>
          </label>
          <div class="quick-adds" role="group" aria-label="Add to amount">
            ${[50, 100, 200, 500].map((n) => `<button type="button" class="chip chip-sm" data-action="add-amount" data-n="${n}">+${n}</button>`).join('')}
          </div>
          <label class="field"><span class="label">What did you buy?</span>
            <input name="item" type="text" maxlength="120" required autocomplete="off" placeholder="2 kg aloo, 1 kg pyaz, paneer…" value="${value('item')}" /></label>
          <div class="row-2">
            <label class="field"><span class="label">Category</span>
              <select name="category">
                ${CATEGORIES.map(([v, l]) => `<option value="${esc(v)}" ${v === chosenCategory ? 'selected' : ''}>${esc(l)}</option>`).join('')}
              </select></label>
            <label class="field"><span class="label">Date</span>
              <input name="date" type="date" required value="${esc(defaultDate())}" /></label>
          </div>
          <div class="receipt-row" id="receiptRow">${receiptRowHtml()}</div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${editing ? 'Save changes' : 'Add purchase'}</button>
            ${editing ? '<button type="button" class="btn btn-ghost" data-action="cancel-edit">Cancel</button>' : ''}
          </div>
        </form>
      </section>`;
  }

  function receiptRowHtml() {
    const r = state.receipt;
    const labels = {
      none: 'Attach bill photo',
      new: 'Bill ready to save',
      keep: 'Bill saved. Tap to replace',
      remove: 'Bill will be removed on save',
    };
    const canRemove = r.mode === 'new' || r.mode === 'keep';
    return `
      <label class="btn btn-ghost btn-small file-btn">${ICON.camera}<span>${labels[r.mode] || labels.none}</span>
        <input type="file" accept="image/*" class="sr-only" data-input="receipt" /></label>
      ${canRemove ? '<button type="button" class="link-btn" data-action="clear-receipt">Remove bill</button>' : ''}`;
  }

  function feedHtml() {
    const d = state.data;
    const list = (state.feed === 'mine' ? d.expenses.filter((e) => e.memberId === d.me.id) : d.expenses).slice(0, 8);
    const seg = (scope, label) => `
      <button type="button" data-action="feed" data-scope="${scope}" class="${state.feed === scope ? 'is-on' : ''}" aria-pressed="${state.feed === scope}">${label}</button>`;
    const empty = state.feed === 'mine'
      ? 'You have not added anything this month yet.'
      : 'Nothing bought this month yet. Add the first purchase above.';

    return `
      <section class="stack" id="feedBlock" aria-labelledby="feedHead">
        <div class="section-head">
          <h2 id="feedHead">Recent purchases</h2>
          <div class="segmented" role="group" aria-label="Show purchases">${seg('all', 'Everyone')}${seg('mine', 'Mine')}</div>
        </div>
        <div class="ledger">${list.length ? list.map(ledgerRow).join('') : emptyState(empty)}</div>
        <button type="button" class="link-btn" data-action="tab" data-tab="khata">Open the full khata</button>
      </section>`;
  }

  function ledgerRow(e) {
    const d = state.data;
    const owner = memberById(e.memberId) || { name: 'Member' };
    const mine = e.memberId === d.me.id;
    const actions = mine
      ? `<button type="button" class="text-btn" data-action="edit" data-id="${esc(e.id)}">Edit</button>
         <button type="button" class="text-btn text-danger" data-action="delete" data-id="${esc(e.id)}">Delete</button>`
      : `<span class="lock">${ICON.lock}Only ${esc(owner.name)} can change this</span>`;
    const bill = e.hasReceipt
      ? `<button type="button" class="text-btn" data-action="bill" data-id="${esc(e.id)}">View bill</button>`
      : '';
    return `
      <article class="ledger-row">
        <div class="ledger-main">
          <h3 class="ledger-item">${esc(e.item)}</h3>
          <p class="ledger-meta">${esc(owner.name)}${mine ? ' (you)' : ''} · ${esc(catLabel(e.category))} · ${fmtDate(e.date)}</p>
          <div class="ledger-actions">${actions}${bill}</div>
        </div>
        <div class="ledger-amount">${inr(e.amount)}</div>
      </article>`;
  }

  // ---------- Khata: full ledger with filters ----------

  function filteredExpenses() {
    const d = state.data;
    const k = state.khata;
    const q = k.search.trim().toLowerCase();
    const sorters = {
      date: (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
      oldest: (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
      amount: (a, b) => b.amount - a.amount,
    };
    return d.expenses
      .filter((e) => k.member === 'ALL' || e.memberId === k.member)
      .filter((e) => k.category === 'ALL' || e.category === k.category)
      .filter((e) => !q
        || e.item.toLowerCase().includes(q)
        || (memberById(e.memberId)?.name || '').toLowerCase().includes(q)
        || String(e.amount).includes(q))
      .sort(sorters[k.sort] || sorters.date);
  }

  const filteredSum = () => filteredExpenses().reduce((sum, e) => sum + e.amount, 0);

  function ledgerListHtml() {
    const list = filteredExpenses();
    return list.length ? list.map(ledgerRow).join('') : emptyState('No purchases match these filters.');
  }

  function refreshKhataList() {
    $('#ledgerList').innerHTML = ledgerListHtml();
    $('#khataTotal').textContent = inr(filteredSum());
    $('#khataBanner').innerHTML = memberBanner();
  }

  function memberBanner() {
    const k = state.khata;
    if (k.member === 'ALL') return '';
    const m = memberById(k.member);
    if (!m) return '';
    const net = Math.round(m.net);
    return `
      <div class="member-banner">
        <div class="who">${avatar(m)}<div class="ledger-main"><h3>${esc(m.name)}</h3>
          <p class="muted">${m.expenseCount} purchases · ${m.activeDays} active days</p></div></div>
        <div class="right">
          <p>Share ${inr(Math.round(m.fairShare))}</p>
          <p class="${net >= 0 ? 'pos' : 'neg'}"><b>${net >= 0 ? `Gets back ${inr(net)}` : `Pays ${inr(-net)}`}</b></p>
        </div>
      </div>`;
  }

  function categoryBars() {
    const d = state.data;
    const totals = Object.fromEntries(CATEGORIES.map(([v]) => [v, 0]));
    d.expenses.forEach((e) => { totals[e.category] = (totals[e.category] || 0) + e.amount; });
    const total = Math.max(1, d.summary.totalSpend);
    const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    return `
      <div class="bars">
        ${rows.map(([cat, amt]) => {
          const pct = Math.round((amt / total) * 100);
          return `
            <div>
              <div class="bar-head"><span>${esc(catLabel(cat))}</span><b>${inr(amt)} · ${pct}%</b></div>
              <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${pct}%"></div></div>
            </div>`;
        }).join('')}
      </div>`;
  }

  function khataView() {
    const d = state.data;
    const k = state.khata;
    const chip = (id, label, value) => `
      <button type="button" class="chip ${k.member === id ? 'is-on' : ''}" aria-pressed="${k.member === id}" data-action="khata-member" data-id="${esc(id)}">
        ${esc(label)} <b>${esc(value)}</b>
      </button>`;
    const chips = chip('ALL', 'All five', inr(d.summary.totalSpend))
      + d.members.map((m) => chip(m.id, m.name, inr(m.paid))).join('');
    const catOpts = [['ALL', 'All categories'], ...CATEGORIES]
      .map(([v, l]) => `<option value="${esc(v)}" ${k.category === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const sortOpts = [['date', 'Newest first'], ['oldest', 'Oldest first'], ['amount', 'Highest amount']]
      .map(([v, l]) => `<option value="${v}" ${k.sort === v ? 'selected' : ''}>${l}</option>`).join('');

    return `
      <section class="stack-lg">
        <div class="page-head">
          <div><h1>Khata</h1><p>Every purchase this month. You can change only your own.</p></div>
          <div class="total-box"><span>Showing</span><b id="khataTotal">${inr(filteredSum())}</b></div>
        </div>
        <div class="chip-row" role="group" aria-label="Filter by flatmate">${chips}</div>
        <div id="khataBanner">${memberBanner()}</div>
        <div class="filters">
          <input type="search" class="input" value="${esc(k.search)}" placeholder="Search item, name or amount" aria-label="Search purchases" data-input="khata-search" />
          <div class="row-2">
            <select class="input" aria-label="Category" data-input="khata-category">${catOpts}</select>
            <select class="input" aria-label="Sort" data-input="khata-sort">${sortOpts}</select>
          </div>
        </div>
        <div class="toolbar">
          <button type="button" class="btn btn-ghost btn-small" data-action="share-summary">${ICON.share} Share summary</button>
          <button type="button" class="btn btn-ghost btn-small" data-action="export-csv">${ICON.download} Download CSV</button>
        </div>
        <div class="ledger" id="ledgerList">${ledgerListHtml()}</div>
        <section class="card" aria-labelledby="catHead">
          <h2 id="catHead">By category</h2>
          ${categoryBars()}
        </section>
      </section>`;
  }

  // ---------- Hisab: who pays whom, email status, math ----------

  function mailStatusText(d) {
    const r = d.emailStatus.lastReport;
    if (!r) {
      return d.isCurrentMonth
        ? 'Email goes to all five automatically on the last day of the month.'
        : 'No report has been emailed for this month yet.';
    }
    const where = r.mode === 'smtp' ? 'Emailed' : 'Saved on the server (email is not set up yet)';
    return `${where} ${fmtDateTime(r.at)}. ${r.delivered} of ${d.members.length} delivered${r.failed ? `, ${r.failed} failed` : ''}.`;
  }

  function transfersHtml() {
    const d = state.data;
    if (!d.transfers.length) {
      return emptyState(d.summary.expenseCount ? 'Everyone is settled. No transfers needed.' : 'Add purchases to see who pays whom.');
    }
    return d.transfers.map((t) => {
      const payer = t.fromId === d.me.id;
      const canMark = payer || t.toId === d.me.id || d.me.role === 'admin';
      return `
        <article class="transfer ${t.settled ? 'is-done' : ''}">
          <div class="transfer-main">
            <p class="transfer-line"><b>${esc(t.fromName)}</b> pays <b>${esc(t.toName)}</b></p>
            <p class="muted small">${t.toUpi ? `UPI ${esc(t.toUpi)}` : 'No UPI ID set yet'}</p>
          </div>
          <div class="transfer-side">
            <span class="transfer-amount ${t.settled ? 'line-through' : ''}">${inr(t.amount)}</span>
            <div class="transfer-actions">
              ${payer && !t.settled && t.upiLink ? `<a class="btn btn-primary btn-small" href="${esc(t.upiLink)}">Pay via UPI</a>` : ''}
              ${canMark ? `<button type="button" class="btn btn-ghost btn-small" data-action="toggle-paid" data-key="${esc(t.key)}" data-settled="${t.settled ? '0' : '1'}">${t.settled ? 'Undo' : 'Mark paid'}</button>` : ''}
            </div>
          </div>
        </article>`;
    }).join('');
  }

  function personRow(m) {
    const d = state.data;
    const net = Math.round(m.net);
    const away = m.daysAway ? ` · ${m.daysAway} away (${m.exempt ? 'deducted' : 'no cut'})` : '';
    return `
      <div class="ledger-row" data-action="view-member-khata" data-id="${esc(m.id)}" role="button" tabindex="0" title="Click to view all payments by ${esc(m.name)}" style="cursor: pointer;">
        <div class="who">
          ${avatar(m)}
          <div class="ledger-main">
            <h3 class="ledger-item">${esc(m.name)}${m.id === d.me.id ? ' <span class="tag">you</span>' : ''}</h3>
            <p class="ledger-meta">Paid ${inr(m.paid)} · ${m.activeDays} of ${d.daysInMonth} days · share ${inr(Math.round(m.fairShare))}${away}</p>
          </div>
        </div>
        <div class="ledger-amount ${net >= 0 ? 'pos' : 'neg'}">${net > 0 ? '+' : ''}${inr(net)}</div>
      </div>`;
  }

  function hisabView() {
    const d = state.data;
    const s = d.summary;
    const paid = d.transfers.filter((t) => t.settled).length;
    return `
      <section class="stack-lg">
        <div class="page-head"><div><h1>Hisab</h1><p>${esc(d.label)} · who pays whom</p></div></div>
        <section class="card" aria-labelledby="totalHead">
          <p class="muted">Total spent</p>
          <p class="big-number" id="totalHead">${inr(s.totalSpend)}</p>
          <p class="muted small">${s.totalActiveDays} active days · ${rateText(s.ratePerDay)} a day · full-month share ${inr(Math.round(s.fullMonthShare))}</p>
          <div class="toolbar">
            <button type="button" class="btn btn-ghost btn-small" data-action="share-summary">${ICON.share} Share summary</button>
            ${d.me.role === 'admin' ? '<button type="button" class="btn btn-primary btn-small" data-action="send-report">Email report to everyone</button>' : ''}
          </div>
          <p class="status-line">${esc(mailStatusText(d))}</p>
        </section>
        <section class="stack" aria-labelledby="whoHead">
          <div class="section-head">
            <h2 id="whoHead">Who pays whom</h2>
            ${d.transfers.length ? `<span class="muted small">${paid} of ${d.transfers.length} paid</span>` : ''}
          </div>
          <div>${transfersHtml()}</div>
          ${d.transfers.length ? '<p class="muted small">Tap Pay via UPI to open your UPI app with the amount filled in. Mark it paid once the money has moved.</p>' : ''}
        </section>
        <section class="stack" aria-labelledby="mathHead">
          <div class="section-head">
            <h2 id="mathHead">How each share is worked out</h2>
            <span class="muted small">Tap any flatmate to view their purchases</span>
          </div>
          <div class="ledger">${d.members.map(personRow).join('')}</div>
          <p class="muted small">Share = active days × per-day rate. Active days = days in the month minus deducted days. Away 7 or more days means all those days are deducted. Net = paid minus share.</p>
        </section>
        <section class="card" aria-labelledby="actHeadHisab">
          <div class="section-head">
            <h2 id="actHeadHisab">Activity & History</h2>
            <span class="muted small">Transparent to everyone</span>
          </div>
          ${auditHtml()}
        </section>
      </section>`;
  }

  // ---------- Leave: the >7-day rule ----------

  function leaveFormHtml(m) {
    const d = state.data;
    return `
      <form data-form="leave" class="stack">
        <div class="stepper">
          <button type="button" class="icon-btn" data-action="leave-step" data-delta="-1" aria-label="One day less">${ICON.minus}</button>
          <label class="sr-only" for="leaveDays">Days away</label>
          <input id="leaveDays" name="days" class="input stepper-input" type="number" inputmode="numeric" min="0" max="${d.daysInMonth}" step="1" value="${m.daysAway}" />
          <button type="button" class="icon-btn" data-action="leave-step" data-delta="1" aria-label="One day more">${ICON.plus}</button>
        </div>
        <label class="field"><span class="label">Trip note (optional)</span>
          <input name="note" type="text" maxlength="120" placeholder="Home trip, 12 to 18 Nov" value="${esc(m.leaveNote)}" /></label>
        <button type="submit" class="btn btn-primary btn-block">Save my leave</button>
      </form>`;
  }

  function leaveCard(m) {
    const d = state.data;
    const isMe = m.id === d.me.id;
    const status = m.daysAway === 0
      ? 'Present all month.'
      : m.exempt
        ? `${m.daysAway} days away. ${m.deductedDays} days deducted.`
        : `${m.daysAway} days away. Within the 6-day limit, so nothing is deducted.`;
    return `
      <article class="person-card ${isMe ? 'is-me' : ''}">
        <header class="person-head">
          ${avatar(m)}
          <div>
            <h3>${esc(m.name)}${isMe ? ' <span class="tag">you</span>' : ''}</h3>
            <p class="muted small">${esc(m.leaveNote || 'No trip note')}</p>
          </div>
          <div class="right"><span class="muted small">Active</span><b>${m.activeDays}/${d.daysInMonth} days</b></div>
        </header>
        <p class="status">${esc(status)}</p>
        ${isMe ? leaveFormHtml(m) : ''}
      </article>`;
  }

  function leaveView() {
    const d = state.data;
    return `
      <section class="stack-lg">
        <div class="page-head"><div><h1>Leave</h1><p>Days away in ${esc(d.label)}.</p></div></div>
        <div class="rule-card">
          <p><b>6 days or fewer:</b> nothing is deducted (normal flat sharing).</p>
          <p><b>7 days or more (inclusive):</b> all away days are deducted from that person's share.</p>
          <p class="muted small">Away 7 days, all 7 days come off. Away 10 days, all 10 days come off. Away 5 days, nothing comes off.</p>
        </div>
        <div class="stack">${d.members.map(leaveCard).join('')}</div>
      </section>`;
  }

  // ---------- Me: profile, password, admin, activity ----------

  function adminCard() {
    const d = state.data;
    const others = d.members.filter((m) => m.id !== d.me.id);
    const mailNote = d.emailStatus.mode === 'smtp'
      ? 'Email is connected, so the new password is also emailed to them.'
      : 'Email is not connected yet, so the new password is shown here only. Share it privately.';
    return `
      <section class="card" aria-labelledby="adminHead">
        <h2 id="adminHead">Flatmate passwords</h2>
        <p class="muted small">Use this when someone is locked out. You see the temporary password once. They must choose their own at the next sign-in.</p>
        <div class="ledger">
          ${others.map((m) => `
            <div class="ledger-row">
              <div class="who">
                ${avatar(m)}
                <div class="ledger-main">
                  <h3 class="ledger-item">${esc(m.name)}</h3>
                  <p class="ledger-meta">${m.mustChangePassword ? 'Still on a temporary password' : 'Personal password set'}${m.email ? ` · ${esc(m.email)}` : ' · no email'}</p>
                </div>
              </div>
              <button type="button" class="btn btn-ghost btn-small" data-action="reset-password" data-id="${esc(m.id)}" data-name="${esc(m.name)}">Reset</button>
            </div>`).join('')}
        </div>
        <p class="muted small">${mailNote}</p>
      </section>`;
  }

  function auditHtml() {
    const items = (state.data.audit || []).slice(0, 50);
    if (!items.length) return emptyState('Nothing recorded yet.');
    return `<div class="ledger">${items.map((a) => {
      let tagClass = 'tag';
      if (a.action === 'ADDED') tagClass = 'tag tag-added';
      else if (a.action === 'EDITED') tagClass = 'tag tag-edited';
      else if (a.action === 'DELETED') tagClass = 'tag tag-deleted';
      else if (a.action === 'PAYMENT') tagClass = 'tag tag-payment';
      return `
        <div class="ledger-row log-row">
          <div class="ledger-main">
            <p class="small">
              <span class="${tagClass}" style="margin-left:0;margin-right:6px;">${esc(a.action)}</span>
              <b>${esc(a.actor)}</b>: ${esc(a.detail)}
            </p>
          </div>
          <span class="muted small">${fmtDateTime(a.at)}</span>
        </div>`;
    }).join('')}</div>`;
  }

  function meView() {
    const me = state.data.me;
    const isAdmin = me.role === 'admin';
    return `
      <section class="stack-lg">
        <div class="page-head">
          <div><h1>${esc(me.name)}</h1><p>Your profile, UPI ID and password.</p></div>
        </div>

        <section class="card" aria-labelledby="profileHead">
          <h2 id="profileHead">Profile</h2>
          <div class="profile-top">
            ${avatar(me, 'av-xl')}
            <div class="stack-sm">
              <label class="btn btn-ghost btn-small file-btn">${ICON.camera} Change photo
                <input type="file" accept="image/*" class="sr-only" data-input="avatar" /></label>
              ${me.avatar ? '<button type="button" class="link-btn" data-action="remove-avatar">Remove photo</button>' : ''}
            </div>
          </div>
          <form data-form="profile" class="stack">
            <label class="field"><span class="label">Email (the monthly report goes here)</span>
              <input name="email" type="email" required autocomplete="email" value="${esc(me.email)}" /></label>
            <label class="field"><span class="label">UPI ID (people pay you here)</span>
              <input name="upi" type="text" required autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="name@bank" value="${esc(me.upi)}" /></label>
            <label class="field"><span class="label">Phone (optional)</span>
              <input name="phone" type="tel" autocomplete="tel" value="${esc(me.phone)}" /></label>
            <button type="submit" class="btn btn-primary btn-block">Save profile</button>
          </form>
        </section>

        <section class="card" aria-labelledby="pwHead">
          <h2 id="pwHead">Change password</h2>
          <p class="muted small">At least 8 characters, with letters and numbers. No one else in the flat can use the same one. Changing it signs you out on your other devices.</p>
          <form data-form="password" class="stack">
            <label class="field"><span class="label">Current password</span>
              <input name="currentPassword" type="password" required autocomplete="current-password" /></label>
            <label class="field"><span class="label">New password</span>
              <input name="newPassword" type="password" required minlength="8" autocomplete="new-password" /></label>
            <label class="field"><span class="label">Repeat new password</span>
              <input name="confirm" type="password" required minlength="8" autocomplete="new-password" /></label>
            <button type="submit" class="btn btn-primary btn-block">Set new password</button>
          </form>
        </section>

        ${isAdmin ? adminCard() : ''}

        <section class="card" aria-labelledby="actHead">
          <h2 id="actHead">Recent activity</h2>
          ${auditHtml()}
        </section>

        <button type="button" class="btn btn-ghost btn-block" data-action="sign-out">Sign out</button>
      </section>`;
  }

  // ---------- Business actions ----------

  async function goTo(tab) {
    state.tab = tab;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setField(name, value) {
    const el = $(`#composer [name="${name}"]`);
    if (el) el.value = value;
  }

  function startEdit(id) {
    const e = state.data.expenses.find((x) => x.id === id);
    if (!e) return;
    state.editingId = id;
    state.form = { amount: e.amount, item: e.item, category: e.category, date: e.date };
    state.receipt = { mode: e.hasReceipt ? 'keep' : 'none' };
    state.tab = 'home';
    render();
    const el = $('#composer');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    state.editingId = null;
    state.form = null;
    state.receipt = { mode: 'none' };
    render();
  }

  async function deleteExpense(id) {
    const e = state.data.expenses.find((x) => x.id === id);
    if (!e) return;
    const ok = await askConfirm({
      title: 'Delete this purchase?',
      body: `"${e.item}" (${inr(e.amount)}) will be removed for everyone.`,
      okLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const res = await run(() => api(`/api/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' }), 'Purchase deleted.');
    if (!res) return;
    if (state.editingId === id) {
      state.editingId = null;
      state.form = null;
    }
    await refresh();
  }

  async function showBill(id) {
    const res = await run(() => api(`/api/expenses/${encodeURIComponent(id)}/receipt`));
    if (!res) return;
    openModal(`
      <h3>Bill photo</h3>
      <img class="bill-img" src="${esc(res.dataUrl)}" alt="Bill photo" />
      <div class="form-actions"><button type="button" class="btn btn-ghost btn-block" data-action="close-modal">Close</button></div>`);
  }

  async function togglePaid(key, settled) {
    const res = await run(() => api(`/api/settlement/${encodeURIComponent(state.month)}/paid`, {
      method: 'PUT',
      body: { key, settled },
    }));
    if (res) await refresh();
  }

  async function sendReport() {
    const ok = await askConfirm({
      title: 'Email the report to everyone?',
      body: 'All five flatmates get their own summary and the full table. Send it once the month’s purchases are in.',
      okLabel: 'Send to all five',
    });
    if (!ok) return;
    const res = await run(() => api(`/api/admin/reports/${encodeURIComponent(state.month)}/send`, { method: 'POST' }));
    if (!res) return;
    const r = res.record;
    toast(
      r.mode === 'smtp'
        ? `Emailed ${r.delivered} of ${state.data.members.length}.`
        : 'Saved the report on the server. Email is not set up yet.',
      r.failed ? 'error' : 'success',
    );
    await refresh();
  }

  function askReset(id, name) {
    openModal(`
      <h3>Reset ${esc(name)}'s password</h3>
      <p class="muted">${esc(name)} will be signed out everywhere and must choose a new password at the next sign-in.</p>
      <form data-form="reset" data-id="${esc(id)}" data-name="${esc(name)}" class="stack">
        <label class="field"><span class="label">Set a password yourself (optional)</span>
          <input name="newPassword" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Leave blank to generate one" /></label>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
          <button type="submit" class="btn btn-danger">Reset password</button>
        </div>
      </form>`);
  }

  async function saveAvatar(dataUrl) {
    const res = await run(
      () => api('/api/me/avatar', { method: 'PUT', body: { avatar: dataUrl } }),
      dataUrl ? 'Photo updated.' : 'Photo removed.',
    );
    if (res) await refresh();
  }

  // ---------- Images: shrink phone photos before upload ----------

  function compressImage(file, maxSide, quality, maxChars) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let side = maxSide;
        let q = quality;
        let out = '';
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          out = canvas.toDataURL('image/jpeg', q);
          if (out.length <= maxChars) return resolve(out);
          side = Math.round(side * 0.75);
          q = Math.max(0.4, q - 0.1);
        }
        return reject(new Error('That photo is still too large. Try a smaller one.'));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read that photo. Try a JPG or PNG.'));
      };
      img.src = url;
    });
  }

  async function onReceiptPicked(file) {
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 1280, 0.74, 1400000);
      state.receipt = { mode: 'new', dataUrl };
      $('#receiptRow').innerHTML = receiptRowHtml();
      toast('Bill photo attached.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function onAvatarPicked(file) {
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 320, 0.82, 380000);
      await saveAvatar(dataUrl);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- Sharing & export ----------

  function summaryText() {
    const d = state.data;
    const s = d.summary;
    const lines = [
      `FlatKhata · ${d.label}`,
      `Spent ${inr(s.totalSpend)} · ${s.totalActiveDays} active days · ${rateText(s.ratePerDay)} a day`,
      '',
      ...d.members.map((m) => {
        const n = Math.round(m.net);
        const result = n > 0 ? `gets back ${inr(n)}` : n < 0 ? `pays ${inr(-n)}` : 'is settled';
        return `${m.name}: paid ${inr(m.paid)}, share ${inr(Math.round(m.fairShare))}, ${result}`;
      }),
      '',
      'Who pays whom:',
      ...(d.transfers.length
        ? d.transfers.map((t) => `• ${t.fromName} pays ${inr(t.amount)} to ${t.toName}${t.toUpi ? ` (UPI ${t.toUpi})` : ''}`)
        : ['• Everyone is settled.']),
    ];
    return lines.join('\n');
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('Copy failed');
  }

  async function shareSummary() {
    const text = summaryText();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'FlatKhata summary', text });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    await run(() => copyText(text), 'Summary copied. Paste it into the group chat.');
  }

  function exportCsv() {
    const d = state.data;
    const names = Object.fromEntries(d.members.map((m) => [m.id, m.name]));
    const rows = [
      ['Date', 'Member', 'Category', 'Item', 'Amount (INR)'],
      ...d.expenses.map((e) => [e.date, names[e.memberId] || '', e.category, e.item, e.amount]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `FlatKhata_${d.month}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('CSV downloaded.', 'success');
  }

  // ---------- Form submissions ----------

  async function submitLogin(form) {
    clearFormError(form);
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: { memberId: state.loginId, password: form.elements.password.value },
      });
      saveSession(res.token);
      state.me = res.user;
      if (state.me.mustChangePassword) return showForceChange();
      await loadMonth('');
    } catch (err) {
      formError(form, err.message);
      btn.disabled = false;
    }
    return undefined;
  }

  async function submitPassword(form) {
    clearFormError(form);
    const f = form.elements;
    const currentPassword = f.currentPassword.value;
    const newPassword = f.newPassword.value;
    if (newPassword.length < 8) return formError(form, 'Use at least 8 characters.');
    if (newPassword !== f.confirm.value) return formError(form, 'The two new passwords do not match.');

    try {
      const res = await api('/api/me/password', { method: 'POST', body: { currentPassword, newPassword } });
      saveSession(res.token);
      state.me = res.user;
      toast('Password updated.', 'success');
      await loadMonth(state.month || '');
    } catch (err) {
      formError(form, err.message);
    }
    return undefined;
  }

  async function submitExpense(form) {
    const f = form.elements;
    const amount = Math.round(Number(f.amount.value));
    // `f.item` would return the collection's built-in item() method, so look the field up by name.
    const item = f.namedItem('item').value.trim();
    if (!(amount >= 1)) return toast('Enter the amount in rupees.', 'error');
    if (item.length < 2) return toast('Describe what you bought.', 'error');

    const body = { amount, item, category: f.category.value, date: f.date.value };
    if (state.receipt.mode === 'new') body.receipt = state.receipt.dataUrl;
    if (state.receipt.mode === 'remove') body.receipt = null;

    const editing = state.editingId;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = editing
        ? await api(`/api/expenses/${encodeURIComponent(editing)}`, { method: 'PUT', body })
        : await api('/api/expenses', { method: 'POST', body });

      const savedYm = res.expense.date.slice(0, 7);
      state.editingId = null;
      state.form = null;
      state.receipt = { mode: 'none' };

      if (savedYm !== state.month) {
        toast(`Saved to ${shortMonth(savedYm)}.`, 'success');
        await loadMonth(savedYm);
      } else {
        toast(editing ? 'Purchase updated.' : `Added ${inr(amount)} to your khata.`, 'success');
        await loadMonth(state.month);
      }
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  }

  async function submitLeave(form) {
    const days = Number(form.elements.days.value);
    const note = form.elements.note.value.trim();
    const res = await run(
      () => api('/api/leave', { method: 'PUT', body: { month: state.month, days, note } }),
      'Leave saved.',
    );
    if (res) await refresh();
  }

  async function submitProfile(form) {
    const f = form.elements;
    const body = { email: f.email.value.trim(), upi: f.upi.value.trim(), phone: f.phone.value.trim() };
    const res = await run(() => api('/api/me/profile', { method: 'PUT', body }), 'Profile saved.');
    if (res) {
      state.me = res.user;
      await refresh();
    }
  }

  async function submitReset(form) {
    clearFormError(form);
    const id = form.dataset.id;
    const newPassword = form.elements.newPassword.value.trim();
    let res;
    try {
      res = await api(`/api/admin/members/${encodeURIComponent(id)}/reset-password`, {
        method: 'POST',
        body: { newPassword },
      });
    } catch (err) {
      formError(form, err.message);
      return;
    }
    openModal(`
      <h3>New temporary password for ${esc(res.name)}</h3>
      <p class="pass">${esc(res.temporaryPassword)}</p>
      <p class="muted small">${res.emailed
        ? `Emailed to ${esc(res.name)} as well.`
        : 'Email is not connected, so share this with them privately.'}</p>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-action="copy" data-text="${esc(res.temporaryPassword)}">Copy</button>
        <button type="button" class="btn btn-primary" data-action="close-modal">Done</button>
      </div>`);
    await refresh();
  }

  // ---------- Event wiring ----------

  const ACTIONS = {
    retry: () => boot(),
    'pick-member': (el) => { state.loginId = el.dataset.id; showLogin(); },
    'forgot-password': async () => {
      const m = state.members.find((x) => x.id === state.loginId);
      if (!m) return toast('Select your name first.', 'error');
      const ok = await askConfirm({
        title: `Reset password for ${m.name}?`,
        body: 'A new temporary password will be sent to your registered email address.',
        okLabel: 'Send email',
      });
      if (!ok) return;
      await run(
        () => api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ memberId: m.id }) }),
        'Temporary password sent! Check your email.'
      );
    },
    'sign-out': () => { clearSession(); showLogin(); },
    tab: (el) => goTo(el.dataset.tab),
    month: (el) => goMonth(shiftMonthClient(state.month, Number(el.dataset.delta))),
    feed: (el) => {
      state.feed = el.dataset.scope;
      $('#feedBlock').outerHTML = feedHtml();
    },
    'khata-member': (el) => { state.khata.member = el.dataset.id; render(); },
    'view-member-khata': (el) => { state.khata.member = el.dataset.id; goTo('khata'); },
    preset: (el) => {
      const p = PRESETS[Number(el.dataset.index)];
      setField('item', p.item);
      setField('amount', p.amount);
      setField('category', p.category);
    },
    'add-amount': (el) => {
      const input = $('#composer [name="amount"]');
      input.value = (Number(input.value) || 0) + Number(el.dataset.n);
    },
    'clear-receipt': () => {
      const e = editingExpense();
      state.receipt = e && e.hasReceipt ? { mode: 'remove' } : { mode: 'none' };
      $('#receiptRow').innerHTML = receiptRowHtml();
    },
    'cancel-edit': () => cancelEdit(),
    edit: (el) => startEdit(el.dataset.id),
    delete: (el) => deleteExpense(el.dataset.id),
    bill: (el) => showBill(el.dataset.id),
    'share-summary': () => shareSummary(),
    'export-csv': () => exportCsv(),
    'toggle-paid': (el) => togglePaid(el.dataset.key, el.dataset.settled === '1'),
    'send-report': () => sendReport(),
    'leave-step': (el) => {
      const input = $('#leaveDays');
      const max = Number(input.max);
      input.value = Math.min(max, Math.max(0, (Number(input.value) || 0) + Number(el.dataset.delta)));
    },
    'remove-avatar': () => saveAvatar(null),
    'reset-password': (el) => askReset(el.dataset.id, el.dataset.name),
    copy: async (el) => {
      await run(() => copyText(el.dataset.text), 'Copied.');
    },
    'close-modal': () => closeModal(),
    backdrop: (el, e) => { if (e.target === el) closeModal(); },
    'confirm-yes': () => {
      const resolve = state.pendingConfirm;
      state.pendingConfirm = null;
      if (resolve) resolve(true);
      closeModal();
    },
    'confirm-no': () => closeModal(),
  };

  const FORMS = {
    login: submitLogin,
    password: submitPassword,
    expense: submitExpense,
    leave: submitLeave,
    profile: submitProfile,
    reset: submitReset,
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) fn(el, e);
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const fn = FORMS[form.dataset.form];
    if (fn) fn(form);
  });

  document.addEventListener('input', (e) => {
    if (e.target.dataset && e.target.dataset.input === 'khata-search') {
      state.khata.search = e.target.value;
      refreshKhataList();
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.dataset) return;
    switch (t.dataset.input) {
      case 'khata-category':
        state.khata.category = t.value;
        refreshKhataList();
        break;
      case 'khata-sort':
        state.khata.sort = t.value;
        refreshKhataList();
        break;
      case 'receipt':
        onReceiptPicked(t.files[0]);
        break;
      case 'avatar':
        onAvatarPicked(t.files[0]);
        break;
      default:
        break;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#modalRoot').innerHTML) closeModal();
  });

  boot();
})();
