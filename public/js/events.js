(async () => {
  const { api, el, qs, eventCard, emptyState, ICONS, params } = CP;
  await CP.ready();
  qs('#searchIcon').outerHTML = ICONS.search;
  const grid = qs('#eventGrid'), chips = qs('#chips'), search = qs('#search'), count = qs('#resultCount');
  let category = params().get('category') || '', q = params().get('q') || '', scope = 'upcoming', timer;
  search.value = q;

  const { categories } = await api('/api/events/categories');
  if (!categories.includes(category)) category = '';
  const chip = (label, val) => el('button', { class: `chip ${val === category ? 'active' : ''}`, onclick: () => { category = val; renderChips(); load(); } }, label);
  function renderChips() { chips.innerHTML = ''; chips.append(chip('All', ''), ...categories.map((c) => chip(c, c))); }
  renderChips();

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active')); t.classList.add('active'); scope = t.dataset.scope; load();
  }));

  async function load() {
    const url = new URL(location.href); url.searchParams.set('category', category); url.searchParams.set('q', q); history.replaceState(null, '', url);
    const data = await api(`/api/events?scope=${scope}&limit=60&q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`);
    count.textContent = `${data.total} ${data.total === 1 ? 'event' : 'events'}${category ? ` in ${category}` : ''}${q ? ` matching “${q}”` : ''}`;
    grid.innerHTML = '';
    if (!data.events.length) {
      const e = emptyState({ title: scope === 'past' ? 'No past events' : 'No events found', text: 'Try another search term or category, or check back soon.', script: 'Quiet for now' });
      e.style.gridColumn = '1 / -1'; grid.append(e); return;
    }
    data.events.forEach((ev) => grid.append(eventCard(ev)));
  }
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { q = search.value.trim(); load(); }, 250); });
  load();
})();
