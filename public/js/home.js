(async () => {
  const { api, el, qs, eventCard, emptyState, ICONS, fmtDate, esc, state } = CP;
  await CP.ready();
  qs('#searchIcon').outerHTML = ICONS.search;
  if (state.user) { const cta = qs('#heroCta'); cta.textContent = state.user.role === 'admin' ? 'Admin dashboard' : 'My tickets'; cta.href = state.user.role === 'admin' ? '/admin-dashboard' : '/student-dashboard'; }

  const grid = qs('#eventGrid'), chips = qs('#chips'), search = qs('#search');
  let category = '', q = '', timer;

  const { categories } = await api('/api/events/categories');
  const chip = (label, val) => el('button', { class: `chip ${val === category ? 'active' : ''}`, onclick: () => { category = val; render(); load(); } }, label);
  function render() { chips.innerHTML = ''; chips.append(chip('All', ''), ...categories.map((c) => chip(c, c))); }
  render();

  async function load() {
    const data = await api(`/api/events?scope=upcoming&limit=6&q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`);
    grid.innerHTML = '';
    if (!data.events.length) { grid.append(emptyState({ title: 'No events match', text: 'Try a different search or category.', script: 'Quiet for now' })); grid.firstChild.style.gridColumn = '1 / -1'; return; }
    data.events.forEach((e) => grid.append(eventCard(e)));
  }
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { q = search.value.trim(); load(); }, 250); });

  // Hero stats and invitation preview from real data.
  const all = await api('/api/events?scope=upcoming&limit=100');
  qs('#statEvents').textContent = all.total;
  qs('#statCats').textContent = new Set(all.events.map((e) => e.category)).size;
  qs('#statSeats').textContent = all.events.filter((e) => e.availability === 'open').reduce((s, e) => s + e.seats_left, 0);
  const feat = all.events.find((e) => e.availability === 'open');
  if (feat) { qs('#inviteTitle').textContent = feat.title; qs('#inviteMeta').textContent = `${fmtDate(feat.start_datetime, { weekday: undefined })} · ${feat.venue}`; qs('#heroInvite').style.cursor = 'pointer'; qs('#heroInvite').onclick = () => location.href = `/event?id=${feat.id}`; }
  const ph = qs('.qr-placeholder'); for (let i = 0; i < 49; i++) ph.append(el('i'));
  load();
})();
