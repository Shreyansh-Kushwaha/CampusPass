(async () => {
  const { api, el, qs, fmtShort, ICONS, params } = CP;
  await CP.ready(); if (!CP.state.user || CP.state.user.role !== 'admin') return;
  qs('#searchIcon').outerHTML = ICONS.search;
  const sel = qs('#eventSelect'), rows = qs('#rows'), search = qs('#search'), statusFilter = qs('#statusFilter');
  let page = 1, timer; const limit = 25;

  const { events } = await api('/api/admin/events?limit=200');
  if (!events.length) { sel.append(el('option', {}, 'No events yet')); return; }
  events.forEach((e) => sel.append(el('option', { value: e.id }, `${e.title} (${e.registered_count})`)));
  const wanted = Number(params().get('event'));
  sel.value = events.some((e) => e.id === wanted) ? wanted : events[0].id;

  async function load() {
    const id = sel.value;
    history.replaceState(null, '', `?event=${id}`);
    qs('#csvBtn').href = `/api/admin/events/${id}/attendees.csv`; qs('#checkinBtn').href = `/admin-checkin?event=${id}`;
    const data = await api(`/api/admin/events/${id}/attendees?q=${encodeURIComponent(search.value.trim())}&status=${statusFilter.value}&page=${page}&limit=${limit}`);
    const e = data.event;
    qs('#title').textContent = e.title; qs('#subtitle').textContent = `${fmtShort(e.start_datetime)} · ${e.venue}`;
    qs('#cReg').textContent = e.registered_count; qs('#cIn').textContent = e.checked_in_count;
    qs('#cOut').textContent = e.registered_count - e.checked_in_count; qs('#cCap').textContent = e.capacity;
    rows.innerHTML = '';
    if (!data.attendees.length) rows.append(el('tr', {}, el('td', { colspan: 5, class: 'muted', style: 'text-align:center;padding:2.5rem' }, 'No attendees match this view.')));
    data.attendees.forEach((a) => rows.append(el('tr', {}, [
      el('td', {}, [el('strong', {}, a.full_name), el('span', { class: 'sub' }, a.email)]),
      el('td', { class: 'mono' }, a.ticket_token),
      el('td', {}, fmtShort(a.registered_at)),
      el('td', {}, a.registration_status === 'cancelled' ? el('span', { class: 'badge badge-cancelled' }, 'Cancelled') : a.checked_in_at ? el('span', { class: 'badge badge-checked' }, 'Checked in') : el('span', { class: 'badge badge-confirmed' }, 'Confirmed')),
      el('td', {}, a.checked_in_at ? fmtShort(a.checked_in_at) : el('span', { class: 'muted' }, '—')),
    ])));
    const pages = Math.max(1, Math.ceil(data.total / limit));
    qs('#pageInfo').textContent = `${data.total} record${data.total === 1 ? '' : 's'} · page ${page} of ${pages}`;
    qs('#prev').disabled = page <= 1; qs('#next').disabled = page >= pages;
  }
  sel.onchange = () => { page = 1; load(); };
  statusFilter.onchange = () => { page = 1; load(); };
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { page = 1; load(); }, 250); });
  qs('#prev').onclick = () => { page--; load(); }; qs('#next').onclick = () => { page++; load(); };
  load();
})();
