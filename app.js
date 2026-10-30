(() => {
  'use strict';

  const STORE_KEY = 'cost-tracker-miami:v1';
  const OLD_STORE_KEY = 'wynwood-trip-tracker:v1';
  const TIP_KEY = 'cost-tracker-miami:hide-install-tip';
  const app = document.getElementById('app');
  const sheet = document.getElementById('sheet');
  const backdrop = document.getElementById('sheet-backdrop');
  const toastEl = document.getElementById('toast');

  /* ───────── The crew ───────── */

  const CREW = [
    { id: 'sophia', name: 'Sophia', img: 'crew/sophia.webp', face: 'crew/sophia-face.webp' },
    { id: 'elizabeth', name: 'Elizabeth', img: 'crew/elizabeth.webp', face: 'crew/elizabeth-face.webp' },
    { id: 'jackie', name: 'Jackie', img: 'crew/jackie.webp', face: 'crew/jackie-face.webp' },
    { id: 'hector', name: 'Hector', img: 'crew/hector.webp', face: 'crew/hector-face.webp' },
  ];
  const ALL = CREW.map((c) => c.id);
  const person = (id) => CREW.find((c) => c.id === id);
  const nameOf = (id) => (id === state.me ? 'you' : person(id) ? person(id).name : 'someone else');

  /* ───────── Money (everything is stored in cents) ───────── */

  const fmt = (c) => (c / 100).toFixed(2);
  const money = (c) =>
    (c < 0 ? '-$' : '$') +
    (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // A cost is split evenly between crew members in `people` plus `guests`
  // (people outside the crew). `paidBy` is a crew id or 'other'. `treat` means
  // the payer said "I got it": nobody pays them back.
  const headcount = (it) => it.people.length + it.guests;
  const shareOf = (it) => Math.round(it.amount / Math.max(1, headcount(it)));
  const includesMe = (it) => it.people.includes(state.me);
  const treatedByOther = (it) => it.treat && it.paidBy !== state.me;
  const countsForMe = (it) => includesMe(it) && !treatedByOther(it);
  const myShare = (it) => (countsForMe(it) ? shareOf(it) : 0);
  // Everyone's shares except the payer's own.
  const coveredOf = (it) => shareOf(it) * (headcount(it) - (it.people.includes(it.paidBy) ? 1 : 0));

  // Kindness: what you covered for others when you said "I got it".
  const kindnessOf = (it) => (it.treat && it.paidBy === state.me ? coveredOf(it) : 0);
  // What others will pay you back for a bill you fronted.
  const owedToMe = (it) => (!it.treat && it.paidBy === state.me ? coveredOf(it) : 0);

  function totals() {
    let mine = 0, kindness = 0;
    for (const it of state.items) { mine += myShare(it); kindness += kindnessOf(it); }
    return { mine, kindness, left: state.prediction - mine, pocket: mine + kindness };
  }

  // Each crew member's share of everything logged on this phone.
  function crewShares() {
    const out = Object.fromEntries(ALL.map((id) => [id, 0]));
    for (const it of state.items) {
      for (const id of it.people) if (!it.treat || id === it.paidBy) out[id] += shareOf(it);
    }
    return out;
  }

  // Who owes whom: net balances between crew members, then settle the biggest
  // debts first so there are as few payments as possible.
  function settleUp() {
    const bal = Object.fromEntries(ALL.map((id) => [id, 0]));
    for (const it of state.items) {
      if (!person(it.paidBy) || it.treat) continue;
      const s = shareOf(it);
      for (const id of it.people) if (id !== it.paidBy) { bal[id] -= s; bal[it.paidBy] += s; }
    }
    const debtors = ALL.filter((id) => bal[id] < 0).map((id) => ({ id, amt: -bal[id] })).sort((a, b) => b.amt - a.amt);
    const creditors = ALL.filter((id) => bal[id] > 0).map((id) => ({ id, amt: bal[id] })).sort((a, b) => b.amt - a.amt);
    const moves = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amt = Math.min(debtors[i].amt, creditors[j].amt);
      if (amt > 0) moves.push({ from: debtors[i].id, to: creditors[j].id, amt });
      debtors[i].amt -= amt; creditors[j].amt -= amt;
      if (!debtors[i].amt) i++;
      if (!creditors[j].amt) j++;
    }
    return moves;
  }

  // Lets people type "12.50 + 4.25" or "30.95/2" in the amount box.
  function evalAmount(raw) {
    const t = String(raw).replace(/[$,\s]/g, '').replace(/[x×]/gi, '*').replace(/÷/g, '/');
    if (!t || !/^[\d.+\-*/()]+$/.test(t)) return NaN;
    let i = 0;
    const num = () => {
      if (t[i] === '(') { i++; const v = expr(); if (t[i++] !== ')') throw 0; return v; }
      if (t[i] === '-') { i++; return -num(); }
      const m = /^(\d+\.?\d*|\.\d+)/.exec(t.slice(i));
      if (!m) throw 0;
      i += m[0].length;
      return parseFloat(m[0]);
    };
    const term = () => {
      let v = num();
      while (t[i] === '*' || t[i] === '/') { const op = t[i++]; const r = num(); v = op === '*' ? v * r : v / r; }
      return v;
    };
    const expr = () => {
      let v = term();
      while (t[i] === '+' || t[i] === '-') { const op = t[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
      return v;
    };
    try {
      const v = expr();
      return i === t.length && Number.isFinite(v) ? v : NaN;
    } catch { return NaN; }
  }

  /* ───────── Emoji guessing ───────── */

  const EMOJI_RULES = [
    [/uber|lyft|taxi|cab|ride/i, '🚕'], [/flight|plane|airline|airport/i, '✈️'],
    [/train|metro|bus|brightline|transit/i, '🚆'], [/gas|fuel|parking|car rental|rental car/i, '🚗'],
    [/hotel|airbnb|motel|hostel|stay/i, '🏨'], [/starbucks|coffee|cafe|café|latte|cafecito|espresso/i, '☕'],
    [/sushi/i, '🍣'], [/dumpling/i, '🥟'], [/sandwich|sub|cuban|deli/i, '🥪'], [/pizza/i, '🍕'],
    [/taco|burrito|mexican/i, '🌮'], [/burger/i, '🍔'], [/ramen|noodle|pho/i, '🍜'],
    [/ice cream|gelato|helado/i, '🍦'], [/donut|bakery|pastel|pastry|cake/i, '🧁'],
    [/bar|drink|cocktail|mojito|beer|wine|club/i, '🍹'], [/publix|grocery|market|whole foods|trader|target/i, '🛒'],
    [/walgreens|cvs|pharmacy|medicine|sunscreen/i, '💊'], [/art|museum|exhibit|gallery|mural/i, '🎨'],
    [/beach|pool|boat|cruise/i, '🏖️'], [/shop|clothes|souvenir|gift|store/i, '🛍️'],
    [/ticket|show|concert|game|tour/i, '🎟️'], [/breakfast|brunch|lunch|dinner|food|restaurant/i, '🍽️'],
    [/treat|kind|friend/i, '💝'],
  ];
  const ITEM_EMOJIS = ['💸', '🚕', '✈️', '🏨', '☕', '🥪', '🍣', '🥟', '🍕', '🌮', '🍹', '🍦', '🛒', '💊', '🎨', '🏖️', '🛍️', '🎟️', '💝'];
  const CHEERS = ['¡Dale! 💃', 'Wepa! ✨', 'Added! 🌴', 'On the tab 🧾', 'Miami mode 😎', 'Treat yo self 💅'];
  const THANKS = ['Thank youuu 💖', 'Ily 🥹', 'Next one’s on me 💝', 'Big heart energy 💖'];
  const PAYBACK = ['I’ll pay you back! 🤝', 'Venmo coming 💸', 'I owe you one 😘'];
  const BURST = ['💖', '🌴', '✨', '🦩', '☀️', '💸'];

  const guessEmoji = (name) => (EMOJI_RULES.find(([re]) => re.test(name)) || [, '💸'])[1];

  /* ───────── State ───────── */

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  // Older versions stored `split` (a head count), `iPaid` and a 'kindness' kind.
  // Those become this phone's owner plus "others" outside the crew; anything
  // they counted as kindness becomes an "I got it" treat.
  function normalize(it) {
    if (Array.isArray(it.people)) return { treat: false, ...it };
    const base = { id: it.id || uid(), name: it.name, amount: it.amount, emoji: it.emoji || '💸' };
    const n = Math.max(1, it.split || 1);
    if (it.kind === 'kindness') return { ...base, paidBy: state.me, people: [], guests: 1, treat: true };
    const iPaid = it.iPaid !== false || n === 1;
    return { ...base, paidBy: iPaid ? state.me : 'other', people: [state.me], guests: n - 1, treat: iPaid && n > 1 };
  }

  // The original notes-app list, loadable from the empty screen.
  function exampleItems() {
    const rows = [
      ['Uber to Airport', 3095, 2, '🚕'],
      ['Walgreens', 836, 1, '💊'],
      ['Wynwood Art Exhibit', 3969, 3, '🎨'],
      ['Starbucks', 546, 1, '☕'],
      ['Sandwich', 1748, 1, '🥪'],
      ['Publix', 2456, 1, '🛒'],
      ['Coffee', 639, 1, '☕'],
      ['Sushi', 2274, 1, '🍣'],
      ['Dumplings', 1125, 1, '🥟'],
    ];
    const items = rows.map(([name, amount, split, emoji]) => normalize({ name, amount, split, emoji, iPaid: true }));
    items.push(normalize({ name: 'Treat for a friend', amount: 517, emoji: '💝', kind: 'kindness' }));
    return items;
  }

  const isValid = (s) => s && Array.isArray(s.items) && Number.isFinite(s.prediction);

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (isValid(s)) return s;
      // Carry over costs saved by the earlier multi-trip version.
      const old = JSON.parse(localStorage.getItem(OLD_STORE_KEY));
      const trip = old && Array.isArray(old.trips) && (old.trips.find((t) => /miami/i.test(t.name)) || old.trips[0]);
      if (trip) return { prediction: trip.prediction || 0, items: trip.items || [] };
    } catch { /* fall through */ }
    return { prediction: 0, items: [] };
  }

  let state = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch { toast('Couldn’t save on this device 😬'); }
  }

  /* ───────── Helpers ───────── */

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1900);
  }

  // One of the crew slides up from the bottom with a speech bubble.
  const crewPop = document.getElementById('crew-pop');
  let crewTimer, lastCrew = '';
  function crewSay(msg, who) {
    if (!who) who = pick(ALL.filter((id) => id !== lastCrew));
    lastCrew = who;
    crewPop.querySelector('img').src = person(who).img;
    crewPop.querySelector('.bubble').textContent = msg;
    crewPop.classList.remove('show');
    void crewPop.offsetWidth; // restart the slide-in if it's already showing
    crewPop.classList.add('show');
    clearTimeout(crewTimer);
    crewTimer = setTimeout(() => crewPop.classList.remove('show'), 2300);
  }

  function boing(el) {
    el.classList.remove('boing');
    void el.offsetWidth;
    el.classList.add('boing');
    for (let n = 0; n < 7; n++) {
      const s = document.createElement('span');
      s.className = 'burst';
      s.textContent = pick(BURST);
      const angle = (Math.PI * (n + .5)) / 7;
      s.style.setProperty('--dx', `${Math.cos(angle) * -70}px`);
      s.style.setProperty('--dy', `${-40 - Math.sin(angle) * 70}px`);
      s.style.setProperty('--rot', `${(Math.random() - .5) * 90}deg`);
      el.appendChild(s);
      setTimeout(() => s.remove(), 950);
    }
  }

  const isStandalone = () =>
    window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

  const formula = (cents) => (cents.length ? cents.map(fmt).join(' + ') : '0.00');
  const faces = (ids) => ids.map((id) => `<img class="avatar" src="${person(id).face}" alt="${person(id).name}">`).join('');

  const DRIPS = '<span class="drip d1"></span><span class="drip d2"></span><span class="drip d3"></span><span class="drip d4"></span>';
  const HERO = `
      <header class="hero">
        <span class="kicker">COST TRACKER</span>
        <h1 class="graffiti">Miami <span class="emo">🌴</span></h1>
        <span class="sticker s1" aria-hidden="true">☀️</span>
        <span class="sticker s2" aria-hidden="true">🦩</span>
        ${DRIPS}
      </header>`;

  function splitLabel(it) {
    if (it.people.length === ALL.length && !it.guests) return 'everyone';
    const names = it.people.map(nameOf);
    if (it.guests) names.push(`${it.guests} other${it.guests > 1 ? 's' : ''}`);
    return names.join(', ');
  }

  /* ───────── Text export (matches the notes-app format) ───────── */

  function tripText() {
    const t = totals();
    const lines = [`Cost Tracker Miami 🌴 (${person(state.me).name})`];
    if (state.prediction) lines.push(`Prediction ${fmt(state.prediction).replace(/\.00$/, '')}`);
    lines.push('');
    for (const it of state.items) {
      const n = headcount(it);
      const who = n > 1 || !includesMe(it) ? ` (${splitLabel(it)})` : '';
      lines.push(`${n > 1 ? `${fmt(it.amount)}/${n} = ${fmt(shareOf(it))}` : fmt(it.amount)}\t${it.name}${who}${it.treat ? ' 💝' : ''}`);
    }
    lines.push('', 'TOTAL');
    lines.push(`Total: ${formula(state.items.filter(countsForMe).map(shareOf))} = ${fmt(t.mine)}`);
    const kind = state.items.map(kindnessOf).filter(Boolean);
    if (kind.length) lines.push(`Kindness: ${formula(kind)} = ${fmt(t.kindness)}`);
    const moves = settleUp();
    if (moves.length) {
      lines.push('', 'SETTLE UP');
      for (const m of moves) lines.push(`${person(m.from).name} → ${person(m.to).name}: ${fmt(m.amt)}`);
    }
    return lines.join('\n');
  }

  async function shareText() {
    const text = tripText();
    try {
      if (navigator.share) { await navigator.share({ title: 'Cost Tracker Miami', text }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard ✨'); }
    catch { toast('Couldn’t copy 😬'); }
  }

  /* ───────── View ───────── */

  function render() {
    if (!person(state.me)) { renderHello(); return; }

    const t = totals();
    const pct = state.prediction > 0 ? Math.min(100, (t.mine / state.prediction) * 100) : 0;
    const over = state.prediction > 0 && t.left < 0;
    const barClass = over ? 'over' : pct >= 80 ? 'warn' : '';
    const shares = crewShares();
    const moves = settleUp();

    const items = state.items.map((it) => {
      const n = headcount(it);
      const mine = includesMe(it);
      const counts = countsForMe(it);
      const k = kindnessOf(it);
      const owed = owedToMe(it);
      const math = n > 1 ? `${fmt(it.amount)} ÷ ${n} = ${fmt(shareOf(it))} each` : '';
      const extra = it.guests ? `<span class="guests">+${it.guests}</span>` : '';
      const payerName = person(it.paidBy) ? person(it.paidBy).name : 'Someone';
      const payer = it.paidBy === state.me || it.treat ? '' : `<span class="paid">${esc(payerName)} paid</span>`;
      let tag = '';
      if (k) tag = `<span class="tag">💝 ${mine ? `+${fmt(k)}` : fmt(k)} kind</span>`;
      else if (treatedByOther(it)) tag = `<span class="tag lilac">${esc(payerName)}’s treat 💝</span>`;
      else if (owed) tag = `<span class="tag teal">+${fmt(owed)} owed</span>`;
      const amt = counts ? money(shareOf(it)) : money(k);
      const avatars = n > 1 || !mine ? `<span class="avatars">${faces(it.people)}${extra}</span>` : '';
      const detail = avatars + math + payer + tag;
      return `
        <li>
          <button class="item" data-edit="${it.id}">
            <span class="item-emoji">${esc(it.emoji)}</span>
            <span class="item-main">
              <div class="item-name">${esc(it.name)}</div>
              ${detail ? `<div class="item-math">${detail}</div>` : ''}
            </span>
            <span class="item-amt ${counts || k ? '' : 'muted'}">${amt}</span>
          </button>
        </li>`;
    }).join('');

    const myItems = state.items.filter(countsForMe).map(shareOf);
    const kinds = state.items.map(kindnessOf).filter(Boolean);

    let hideTip = false;
    try { hideTip = localStorage.getItem(TIP_KEY) === '1'; } catch { /* ignore */ }
    const tip = !isStandalone() && !hideTip ? `
      <div class="card install-tip">
        <b>📲 Put me on your Home Screen!</b><br>
        In Safari, tap <b>Share</b> <span aria-hidden="true">⬆️</span> then <b>Add to Home Screen</b>.
        <div style="margin-top:10px"><button class="btn small white" data-act="hide-tip">Got it</button></div>
      </div>` : '';

    app.innerHTML = `
      ${HERO}

      <div class="stats">
        <div class="stat"><div class="stat-label">💸 My total</div><div class="stat-value">${money(t.mine)}</div></div>
        <div class="stat"><div class="stat-label">💝 Kindness</div><div class="stat-value">${money(t.kindness)}</div></div>
        <button class="stat" data-act="edit-prediction" aria-label="Edit prediction">
          <div class="stat-label">🔮 Prediction <span class="stat-edit">✏️</span></div>
          <div class="stat-value">${state.prediction ? money(state.prediction) : 'Set it'}</div>
        </button>
        <div class="stat"><div class="stat-label">${over ? '🚨 Over by' : '🌈 Left'}</div>
          <div class="stat-value ${over ? 'over' : ''}">${state.prediction ? money(Math.abs(t.left)) : '—'}</div></div>
      </div>

      ${state.prediction ? `
        <div class="card budget">
          <div class="budget-row"><span>${Math.round((t.mine / state.prediction) * 100)}% of prediction</span><span>Out of pocket ${money(t.pocket)}</span></div>
          <div class="bar"><div class="bar-fill ${barClass}" style="width:${pct}%"></div></div>
        </div>` : ''}

      <div class="section-title">💖 The crew</div>
      <div class="card crew">
        ${CREW.map((c) => `
          <button class="crew-member" data-crew="${c.id}" aria-label="Boop ${c.name}">
            <img src="${c.img}" alt="" draggable="false">
            <span class="crew-name">${c.name}${c.id === state.me ? ' <i>you</i>' : ''}</span>
            <span class="crew-amt">${money(shares[c.id])}</span>
          </button>`).join('')}
      </div>

      ${moves.length ? `
        <div class="section-title">🤝 Settle up</div>
        <div class="card settle">
          ${moves.map((m) => `
            <div class="settle-row ${m.from === state.me || m.to === state.me ? 'me' : ''}">
              <span class="settle-faces">${faces([m.from])}<span class="arrow">→</span>${faces([m.to])}</span>
              <span class="settle-text"><b>${esc(person(m.from).name)}</b> owes <b>${esc(person(m.to).name)}</b></span>
              <span class="settle-amt">${money(m.amt)}</span>
            </div>`).join('')}
        </div>` : ''}

      <div class="section-title">🧾 Spending</div>
      <div class="card">
        ${items ? `<ul class="list">${items}</ul>` : `<div class="empty"><span class="big">🌴</span>Nothing yet. Tap + to add your first cost!
          <div style="margin-top:14px"><button class="btn small white" data-act="load-example">📋 Load the example list</button></div></div>`}
      </div>

      <div class="section-title">✏️ The math</div>
      <div class="card receipt">
        <h3>Total</h3>
        <p class="math">${formula(myItems)} = <b>${fmt(t.mine)}</b></p>
        <h3>Kindness</h3>
        <p class="math">${formula(kinds)} = <b>${fmt(t.kindness)}</b></p>
        <div class="receipt-actions">
          <button class="btn small teal" data-act="share">📤 Share as text</button>
        </div>
      </div>
      <p class="hint"><b>My total</b> is only your part of each bill. <b>Kindness</b> is what you covered when you told friends “I got it.” Anything they’ll pay you back for goes to <b>Settle up</b> instead.</p>

      ${tip}

      <div class="section-title">💾 Backup</div>
      <div class="card receipt">
        <p class="math" style="margin-bottom:12px">Your costs live on this phone. Save a backup file now and then so you never lose them.</p>
        <div class="receipt-actions">
          <button class="btn small white" data-act="export">⬇️ Save backup</button>
          <button class="btn small white" data-act="import">⬆️ Restore</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>

      <p class="footer-note">This is ${esc(person(state.me).name)}’s phone · <button class="link" data-act="change-me">not you?</button><br>made with 💖 &amp; spray paint in the 305</p>
      <button class="fab" data-act="new-item" aria-label="Add cost">+</button>
    `;
  }

  const helloGrid = (attr) => CREW.map((c) => `
          <button class="crew-member" ${attr}="${c.id}">
            <img src="${c.img}" alt="" draggable="false">
            <span class="crew-name">${c.name}</span>
          </button>`).join('');

  // First launch: everyone picks themselves so "my total" means them.
  function renderHello() {
    app.innerHTML = `
      ${HERO}
      <div class="section-title">👋 Who are you?</div>
      <div class="card crew hello">${helloGrid('data-me')}</div>
      <p class="hint">Tap yourself. Your totals are your share of each bill, and the crew helps you split the rest.</p>
    `;
  }

  /* ───────── Sheets ───────── */

  function openSheet(html, mount) {
    sheet.innerHTML = `<div class="grabber"></div>${html}`;
    sheet.hidden = false;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    mount && mount(sheet);
  }
  function closeSheet() {
    sheet.hidden = true;
    backdrop.hidden = true;
    sheet.innerHTML = '';
    document.body.style.overflow = '';
  }
  backdrop.addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

  const emojiButtons = (list, current) =>
    [...new Set([current, ...list])].map((e) =>
      `<button type="button" data-emoji="${esc(e)}" aria-pressed="${e === current}">${esc(e)}</button>`).join('');

  function setPickedEmoji(root, emoji) {
    const pickEl = root.querySelector('.emoji-pick');
    let b = pickEl.querySelector(`[data-emoji="${CSS.escape(emoji)}"]`);
    if (!b) {
      pickEl.insertAdjacentHTML('afterbegin', `<button type="button" data-emoji="${esc(emoji)}">${esc(emoji)}</button>`);
      b = pickEl.firstElementChild;
    }
    pickEl.querySelectorAll('[data-emoji]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }

  const personChip = (c, attr) =>
    `<button type="button" class="chip" ${attr}="${c.id}"><img class="avatar" src="${c.face}" alt="">${c.id === state.me ? 'Me' : esc(c.name)}</button>`;

  function itemSheet(item) {
    const isNew = !item;
    const draft = item
      ? { ...item, people: [...item.people] }
      : { id: uid(), name: '', amount: 0, emoji: '💸', paidBy: state.me, people: [state.me], guests: 0, treat: false };
    let emojiTouched = !isNew;

    openSheet(`
      <h2>${isNew ? 'Add a cost ✨' : 'Edit cost'}</h2>
      <form id="item-form" autocomplete="off">
        <label class="field"><span>What was it?</span>
          <input class="input" name="name" placeholder="Cafecito, Uber, mural tour…" value="${esc(draft.name)}" maxlength="60" required>
        </label>
        <div class="emoji-pick">${emojiButtons(ITEM_EMOJIS, draft.emoji)}</div>
        <label class="field"><span>Total on the bill</span>
          <input class="input money" name="amount" inputmode="decimal" placeholder="0.00" value="${draft.amount ? fmt(draft.amount) : ''}" required>
        </label>

        <div class="field"><span>Who paid?</span>
          <div class="chips" id="paid-chips">
            ${CREW.map((c) => personChip(c, 'data-paid')).join('')}
            <button type="button" class="chip" data-paid="other">🙋 Someone else</button>
          </div>
        </div>

        <div class="field"><span>Split between</span>
          <div class="chips" id="split-chips">
            <button type="button" class="chip everyone" data-everyone>👯 Everyone</button>
            ${CREW.map((c) => personChip(c, 'data-person')).join('')}
          </div>
          <div class="stepper guests-stepper">
            <button type="button" data-step="-1" aria-label="Fewer other people">−</button>
            <output id="guests-out"></output>
            <button type="button" data-step="1" aria-label="More other people">+</button>
          </div>
        </div>

        <label class="toggle" id="treat-wrap">
          <input type="checkbox" name="treat" id="treat" ${draft.treat ? 'checked' : ''}>
          <span class="switch"></span>
          <span class="t-text"><span id="treat-title"></span><small id="treat-sub"></small></span>
        </label>

        <div class="preview" id="preview"></div>

        <div class="sheet-actions">
          <button class="btn pink block" type="submit">${isNew ? 'Add it 🌴' : 'Save'}</button>
          ${isNew ? '' : '<button class="btn danger block" type="button" data-act="delete">Delete</button>'}
          <button class="btn white block" type="button" data-act="cancel">Cancel</button>
        </div>
      </form>
    `, (root) => {
      const form = root.querySelector('#item-form');
      const nameEl = form.elements.name;
      const amountEl = form.elements.amount;

      const update = () => {
        const v = evalAmount(amountEl.value);
        draft.amount = Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
        root.querySelectorAll('[data-paid]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.paid === draft.paidBy));
        root.querySelectorAll('[data-person]').forEach((b) => b.setAttribute('aria-pressed', draft.people.includes(b.dataset.person)));
        root.querySelector('[data-everyone]').setAttribute('aria-pressed', ALL.every((id) => draft.people.includes(id)));
        root.querySelector('#guests-out').textContent =
          draft.guests ? `+ ${draft.guests} not in the crew` : '+ others not in the crew';

        // "I got it" only makes sense when the payer covers someone else.
        const coversOthers = headcount(draft) - (draft.people.includes(draft.paidBy) ? 1 : 0) > 0;
        root.querySelector('#treat-wrap').hidden = !coversOthers;
        draft.treat = coversOthers && form.elements.treat.checked;
        const payerName = draft.paidBy === state.me ? 'I' : person(draft.paidBy) ? person(draft.paidBy).name : 'Someone else';
        root.querySelector('#treat-title').textContent = `${payerName} got it 💝`;
        root.querySelector('#treat-sub').textContent = draft.paidBy === state.me
          ? 'Nobody pays you back. Counts as your kindness.'
          : `Nobody pays ${draft.paidBy === 'other' ? 'them' : payerName} back.`;

        const p = root.querySelector('#preview');
        const n = headcount(draft);
        if (!n) { p.innerHTML = 'Pick who it’s split between 👆'; return; }
        if (!draft.amount) { p.innerHTML = 'Type an amount. Math like <b>12.50+4</b> works too.'; return; }
        const k = kindnessOf(draft);
        const parts = [];
        if (n > 1) parts.push(`<b>${money(shareOf(draft))}</b> each`);
        parts.push(`Your share <b>${money(myShare(draft))}</b>`);
        if (k) parts.push(`Kindness <b>${money(k)}</b> 💝`);
        if (owedToMe(draft)) parts.push(`Owed back <b>${money(owedToMe(draft))}</b> 🤝`);
        p.innerHTML = parts.join(' · ');
      };

      root.querySelector('.emoji-pick').addEventListener('click', (e) => {
        const b = e.target.closest('[data-emoji]');
        if (!b) return;
        draft.emoji = b.dataset.emoji;
        emojiTouched = true;
        setPickedEmoji(root, draft.emoji);
      });
      nameEl.addEventListener('input', () => {
        if (emojiTouched) return;
        draft.emoji = guessEmoji(nameEl.value);
        setPickedEmoji(root, draft.emoji);
      });
      amountEl.addEventListener('input', update);
      form.elements.treat.addEventListener('change', update);

      root.querySelector('#paid-chips').addEventListener('click', (e) => {
        const b = e.target.closest('[data-paid]');
        if (b) { draft.paidBy = b.dataset.paid; update(); }
      });
      root.querySelector('#split-chips').addEventListener('click', (e) => {
        const b = e.target.closest('[data-person],[data-everyone]');
        if (!b) return;
        if (b.hasAttribute('data-everyone')) {
          draft.people = ALL.every((id) => draft.people.includes(id)) ? [state.me] : [...ALL];
        } else {
          const id = b.dataset.person;
          draft.people = draft.people.includes(id)
            ? draft.people.filter((x) => x !== id)
            : ALL.filter((x) => x === id || draft.people.includes(x));
        }
        update();
      });
      root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
        draft.guests = Math.max(0, Math.min(20, draft.guests + Number(b.dataset.step)));
        update();
      }));

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        update();
        draft.name = nameEl.value.trim();
        if (!draft.name) { nameEl.focus(); return; }
        if (!draft.amount) { amountEl.focus(); toast('Add an amount 💸'); return; }
        if (!headcount(draft)) { toast('Pick who it’s split between 👯'); return; }
        if (isNew) state.items.push(draft);
        else state.items[state.items.findIndex((i) => i.id === draft.id)] = draft;
        save(); closeSheet(); render();
        if (!isNew) { toast('Saved ✨'); return; }
        // Whoever you just covered says thanks; otherwise a random cheer.
        const covered = draft.paidBy === state.me ? draft.people.filter((id) => id !== state.me) : [];
        if (state.prediction && totals().left < 0) crewSay('Uh oh… over budget 🚨');
        else if (covered.length) crewSay(pick(draft.treat ? THANKS : PAYBACK), pick(covered));
        else crewSay(pick(CHEERS));
      });

      root.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
      const del = root.querySelector('[data-act="delete"]');
      del && del.addEventListener('click', () => {
        if (!confirm(`Delete “${draft.name}”?`)) return;
        state.items = state.items.filter((i) => i.id !== draft.id);
        save(); closeSheet(); render();
        toast('Deleted');
      });

      update();
      if (isNew) setTimeout(() => nameEl.focus(), 250);
    });
  }

  function predictionSheet() {
    openSheet(`
      <h2>Prediction 🔮</h2>
      <form id="prediction-form" autocomplete="off">
        <label class="field"><span>How much do you think Miami will cost you?</span>
          <input class="input money" name="prediction" inputmode="decimal" placeholder="372" value="${state.prediction ? fmt(state.prediction) : ''}">
        </label>
        <div class="sheet-actions">
          <button class="btn pink block" type="submit">Save</button>
          <button class="btn white block" type="button" data-act="cancel">Cancel</button>
        </div>
      </form>
    `, (root) => {
      const form = root.querySelector('#prediction-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const raw = form.elements.prediction.value.trim();
        const p = raw ? evalAmount(raw) : 0;
        if (!Number.isFinite(p) || p < 0) { toast('That prediction looks off 🤔'); return; }
        state.prediction = Math.round(p * 100);
        save(); closeSheet(); render();
      });
      root.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
      setTimeout(() => form.elements.prediction.focus(), 250);
    });
  }

  function chooseMe(id) {
    state.me = id;
    state.items = state.items.map(normalize);
    save(); render();
    crewSay(`Hi ${person(id).name}! 🌴`, id);
  }

  // Re-pick who this phone belongs to, swapping them with the old owner on
  // every cost so "me" entries follow the right person.
  function switchMe() {
    const prev = state.me;
    openSheet(`
      <h2>Who are you? 👋</h2>
      <div class="crew hello">${helloGrid('data-switch')}</div>
    `, (root) => root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-switch]');
      if (!b) return;
      const id = b.dataset.switch;
      const swap = (x) => (x === prev ? id : x === id ? prev : x);
      state.items = state.items.map((it) => {
        const people = it.people.map(swap);
        return { ...it, paidBy: swap(it.paidBy), people: ALL.filter((p) => people.includes(p)) };
      });
      state.me = id;
      save(); closeSheet(); render();
      crewSay(`Hi ${person(id).name}! 🌴`, id);
    }));
  }

  /* ───────── Backup ───────── */

  async function exportBackup() {
    const json = JSON.stringify(state, null, 2);
    const name = `miami-costs-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Miami costs backup' });
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const s = JSON.parse(reader.result);
        if (!isValid(s)) throw new Error('bad file');
        if (!confirm('Replace the costs on this phone with the backup?')) return;
        state = { ...s, me: person(s.me) ? s.me : state.me };
        state.items = state.items.map(normalize);
        save(); render();
        toast('Restored ✨');
      } catch { toast('That file isn’t a Miami backup 🤔'); }
    };
    reader.readAsText(file);
  }

  /* ───────── Events ───────── */

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act],[data-edit],[data-crew],[data-me]');
    if (!el) return;
    if (el.dataset.me) return chooseMe(el.dataset.me);
    if (el.dataset.crew) return boing(el);
    if (el.dataset.edit) return itemSheet(state.items.find((i) => i.id === el.dataset.edit));

    switch (el.dataset.act) {
      case 'new-item': return itemSheet();
      case 'edit-prediction': return predictionSheet();
      case 'change-me': return switchMe();
      case 'load-example':
        state.items = exampleItems();
        if (!state.prediction) state.prediction = 37200;
        save(); render();
        return toast('Loaded ✨');
      case 'share': return shareText();
      case 'export': return exportBackup();
      case 'import': return document.getElementById('import-file').click();
      case 'hide-tip':
        try { localStorage.setItem(TIP_KEY, '1'); } catch { /* ignore */ }
        return render();
    }
  });

  app.addEventListener('change', (e) => {
    if (e.target.id === 'import-file' && e.target.files[0]) importBackup(e.target.files[0]);
  });

  if (person(state.me)) { state.items = state.items.map(normalize); save(); }
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
