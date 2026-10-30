(() => {
  'use strict';

  const STORE_KEY = 'cost-tracker-miami:v1';
  const OLD_STORE_KEY = 'wynwood-trip-tracker:v1';
  const TIP_KEY = 'cost-tracker-miami:hide-install-tip';
  const app = document.getElementById('app');
  const sheet = document.getElementById('sheet');
  const backdrop = document.getElementById('sheet-backdrop');
  const toastEl = document.getElementById('toast');

  /* ───────── Money (everything is stored in cents) ───────── */

  const fmt = (c) => (c / 100).toFixed(2);
  const money = (c) =>
    (c < 0 ? '-$' : '$') +
    (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Your part of an item: the bill divided by how many people shared it.
  function shareOf(item) {
    return item.kind === 'kindness' ? 0 : Math.round(item.amount / item.split);
  }

  // What you covered for other people: everyone else's share when you paid
  // a split bill, or the whole amount for a treat.
  function kindnessOf(item) {
    if (item.kind === 'kindness') return item.amount;
    if (!item.iPaid || item.split <= 1) return 0;
    return shareOf(item) * (item.split - 1);
  }

  function totals() {
    let mine = 0, kindness = 0;
    for (const it of state.items) { mine += shareOf(it); kindness += kindnessOf(it); }
    return { mine, kindness, left: state.prediction - mine, pocket: mine + kindness };
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

  const CREW = ['crew/crew-1.webp', 'crew/crew-2.webp', 'crew/crew-3.webp', 'crew/crew-4.webp'];
  const CHEERS = ['¡Dale! 💃', 'Wepa! ✨', 'Added! 🌴', 'On the tab 🧾', 'Miami mode 😎', 'Treat yo self 💅'];
  const KIND_CHEERS = ['So generous 💝', 'Big heart energy 💖', 'Crew loves you 🥹'];
  const BURST = ['💖', '🌴', '✨', '🦩', '☀️', '💸'];

  const guessEmoji = (name) => (EMOJI_RULES.find(([re]) => re.test(name)) || [, '💸'])[1];

  /* ───────── State ───────── */

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  // The original notes-app list, loadable from the empty screen.
  function exampleState() {
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
    const items = rows.map(([name, amount, split, emoji]) => ({
      id: uid(), name, amount, split, emoji, kind: 'expense', iPaid: true,
    }));
    items.push({ id: uid(), name: 'Treat for a friend', amount: 517, split: 1, emoji: '💝', kind: 'kindness', iPaid: true });
    return { prediction: 37200, items };
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
  save();

  /* ───────── Helpers ───────── */

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1900);
  }

  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // One of the crew slides up from the bottom with a speech bubble.
  const crewPop = document.getElementById('crew-pop');
  let crewTimer, lastCrew = -1;
  function crewSay(msg) {
    let i;
    do { i = Math.floor(Math.random() * CREW.length); } while (i === lastCrew && CREW.length > 1);
    lastCrew = i;
    crewPop.querySelector('img').src = CREW[i];
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

  const DRIPS = '<span class="drip d1"></span><span class="drip d2"></span><span class="drip d3"></span><span class="drip d4"></span>';

  /* ───────── Text export (matches the notes-app format) ───────── */

  function tripText() {
    const t = totals();
    const lines = ['Cost Tracker Miami 🌴'];
    if (state.prediction) lines.push(`Prediction ${fmt(state.prediction).replace(/\.00$/, '')}`);
    lines.push('');
    for (const it of state.items) {
      if (it.kind === 'kindness') lines.push(`${fmt(it.amount)}\t${it.name} (kindness)`);
      else if (it.split > 1) lines.push(`${fmt(it.amount)}/${it.split} = ${fmt(shareOf(it))}\t${it.name}`);
      else lines.push(`${fmt(it.amount)}\t${it.name}`);
    }
    lines.push('', 'TOTAL');
    lines.push(`Total: ${formula(state.items.filter((i) => i.kind !== 'kindness').map(shareOf))} = ${fmt(t.mine)}`);
    const kind = state.items.map(kindnessOf).filter(Boolean);
    if (kind.length) lines.push(`Kindness: ${formula(kind)} = ${fmt(t.kindness)}`);
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
    const t = totals();
    const pct = state.prediction > 0 ? Math.min(100, (t.mine / state.prediction) * 100) : 0;
    const barClass = t.left < 0 ? 'over' : pct >= 80 ? 'warn' : '';

    const items = state.items.map((it) => {
      let math = '', amt = money(shareOf(it)), tag = '';
      if (it.kind === 'kindness') {
        math = 'a treat on you';
        amt = money(it.amount);
        tag = '<span class="tag">kindness</span>';
      } else if (it.split > 1) {
        math = `${fmt(it.amount)} / ${it.split} = ${fmt(shareOf(it))}`;
        if (kindnessOf(it)) tag = `<span class="tag teal">+${fmt(kindnessOf(it))} kind</span>`;
      }
      return `
        <li>
          <button class="item" data-edit="${it.id}">
            <span class="item-emoji">${esc(it.emoji)}</span>
            <span class="item-main">
              <div class="item-name">${esc(it.name)}</div>
              ${math || tag ? `<div class="item-math">${math}${tag}</div>` : ''}
            </span>
            <span class="item-amt">${amt}</span>
          </button>
        </li>`;
    }).join('');

    const shares = state.items.filter((i) => i.kind !== 'kindness').map(shareOf);
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
      <header class="hero">
        <span class="kicker">COST TRACKER</span>
        <h1 class="graffiti">Miami <span class="emo">🌴</span></h1>
        <span class="sticker s1" aria-hidden="true">☀️</span>
        <span class="sticker s2" aria-hidden="true">🦩</span>
        ${DRIPS}
      </header>

      <div class="stats">
        <div class="stat"><div class="stat-label">💸 My total</div><div class="stat-value">${money(t.mine)}</div></div>
        <div class="stat"><div class="stat-label">💝 Kindness</div><div class="stat-value">${money(t.kindness)}</div></div>
        <button class="stat" data-act="edit-prediction" aria-label="Edit prediction">
          <div class="stat-label">🔮 Prediction <span class="stat-edit">✏️</span></div>
          <div class="stat-value">${state.prediction ? money(state.prediction) : 'Set it'}</div>
        </button>
        <div class="stat"><div class="stat-label">${t.left < 0 ? '🚨 Over by' : '🌈 Left'}</div>
          <div class="stat-value ${t.left < 0 ? 'over' : ''}">${state.prediction ? money(Math.abs(t.left)) : '—'}</div></div>
      </div>

      ${state.prediction ? `
        <div class="card budget">
          <div class="budget-row"><span>${Math.round((t.mine / state.prediction) * 100)}% of prediction</span><span>Out of pocket ${money(t.pocket)}</span></div>
          <div class="bar"><div class="bar-fill ${barClass}" style="width:${pct}%"></div></div>
        </div>` : ''}

      <div class="section-title">💖 The crew</div>
      <div class="card crew">
        ${CREW.map((src, i) => `<button class="crew-member" data-crew="${i}" aria-label="Boop crew member ${i + 1}"><img src="${src}" alt="" draggable="false"></button>`).join('')}
      </div>

      <div class="section-title">🧾 Spending</div>
      <div class="card">
        ${items ? `<ul class="list">${items}</ul>` : `<div class="empty"><span class="big">🌴</span>Nothing yet. Tap + to add your first cost!
          <div style="margin-top:14px"><button class="btn small white" data-act="load-example">📋 Load the example list</button></div></div>`}
      </div>

      <div class="section-title">✏️ The math</div>
      <div class="card receipt">
        <h3>Total</h3>
        <p class="math">${formula(shares)} = <b>${fmt(t.mine)}</b></p>
        <h3>Kindness</h3>
        <p class="math">${formula(kinds)} = <b>${fmt(t.kindness)}</b></p>
        <div class="receipt-actions">
          <button class="btn small teal" data-act="share">📤 Share as text</button>
        </div>
      </div>
      <p class="hint"><b>My total</b> is only your part of each bill. <b>Kindness</b> is what you covered for your crew: everyone else’s share when you paid a split bill, plus any treats.</p>

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

      <p class="footer-note">made with 💖 &amp; spray paint in the 305</p>
      <button class="fab" data-act="new-item" aria-label="Add cost">+</button>
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

  function wireEmojiPicker(root, onPick) {
    root.querySelector('.emoji-pick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-emoji]');
      if (!b) return;
      root.querySelectorAll('.emoji-pick [data-emoji]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      onPick(b.dataset.emoji);
    });
  }
  function setPickedEmoji(root, emoji) {
    const pick = root.querySelector('.emoji-pick');
    let b = pick.querySelector(`[data-emoji="${CSS.escape(emoji)}"]`);
    if (!b) {
      pick.insertAdjacentHTML('afterbegin', `<button type="button" data-emoji="${esc(emoji)}">${esc(emoji)}</button>`);
      b = pick.firstElementChild;
    }
    pick.querySelectorAll('[data-emoji]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }

  function itemSheet(item) {
    const isNew = !item;
    const draft = item ? { ...item } : { id: uid(), name: '', amount: 0, split: 1, emoji: '💸', kind: 'expense', iPaid: true };
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

        <label class="toggle">
          <input type="checkbox" name="treat" ${draft.kind === 'kindness' ? 'checked' : ''}>
          <span class="switch"></span>
          <span class="t-text">It’s a treat for someone 💝<small>Counts only as kindness, not your total</small></span>
        </label>

        <div id="split-wrap">
          <div class="field"><span style="display:block;margin:0 0 6px 4px;font-weight:600;font-size:14px">Split between</span>
            <div class="stepper">
              <button type="button" data-step="-1" aria-label="Fewer people">−</button>
              <output id="split-out">${draft.split} ${draft.split === 1 ? 'person (just me)' : 'people'}</output>
              <button type="button" data-step="1" aria-label="More people">+</button>
            </div>
          </div>
          <label class="toggle" id="paid-wrap">
            <input type="checkbox" name="iPaid" ${draft.iPaid ? 'checked' : ''}>
            <span class="switch"></span>
            <span class="t-text">I paid the whole bill<small>Their shares count as kindness</small></span>
          </label>
        </div>

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
        draft.kind = form.elements.treat.checked ? 'kindness' : 'expense';
        draft.iPaid = form.elements.iPaid.checked;
        root.querySelector('#split-wrap').hidden = draft.kind === 'kindness';
        root.querySelector('#paid-wrap').hidden = draft.split <= 1;
        root.querySelector('#split-out').textContent = `${draft.split} ${draft.split === 1 ? 'person (just me)' : 'people'}`;

        const p = root.querySelector('#preview');
        if (!draft.amount) { p.innerHTML = 'Type an amount. Math like <b>12.50+4</b> works too.'; return; }
        const k = kindnessOf(draft);
        p.innerHTML = draft.kind === 'kindness'
          ? `Kindness <b>${money(k)}</b> 💝`
          : `Your share <b>${money(shareOf(draft))}</b>${k ? ` · Kindness <b>${money(k)}</b>` : ''}`;
      };

      wireEmojiPicker(root, (e) => { draft.emoji = e; emojiTouched = true; });
      nameEl.addEventListener('input', () => {
        if (emojiTouched) return;
        draft.emoji = guessEmoji(nameEl.value);
        setPickedEmoji(root, draft.emoji);
      });
      amountEl.addEventListener('input', update);
      form.addEventListener('change', update);
      root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
        draft.split = Math.max(1, Math.min(30, draft.split + Number(b.dataset.step)));
        update();
      }));

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        update();
        draft.name = nameEl.value.trim();
        if (!draft.name) { nameEl.focus(); return; }
        if (!draft.amount) { amountEl.focus(); toast('Add an amount 💸'); return; }
        if (draft.kind === 'kindness') draft.split = 1;
        if (isNew) state.items.push(draft);
        else state.items[state.items.findIndex((i) => i.id === draft.id)] = draft;
        save(); closeSheet(); render();
        if (!isNew) toast('Saved ✨');
        else if (totals().left < 0 && state.prediction) crewSay('Uh oh… over budget 🚨');
        else crewSay(pick(kindnessOf(draft) ? KIND_CHEERS : CHEERS));
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
        state = s; save(); render();
        toast('Restored ✨');
      } catch { toast('That file isn’t a Miami backup 🤔'); }
    };
    reader.readAsText(file);
  }

  /* ───────── Events ───────── */

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act],[data-edit],[data-crew]');
    if (!el) return;
    if (el.dataset.crew) return boing(el);
    if (el.dataset.edit) return itemSheet(state.items.find((i) => i.id === el.dataset.edit));

    switch (el.dataset.act) {
      case 'new-item': return itemSheet();
      case 'edit-prediction': return predictionSheet();
      case 'load-example':
        state = exampleState(); save(); render();
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

  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
