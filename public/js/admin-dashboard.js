(async () => {
  const { api, el, qs, fmtShort, statusBadge, fmtDate } = CP;
  await CP.ready(); if (!CP.state.user || CP.state.user.role !== 'admin') return;
  const s = await api('/api/admin/stats');
  qs('#sEvents').textContent = s.total_events; qs('#sEventsSub').textContent = `${s.upcoming_events} upcoming · ${s.total_students} students`;
  qs('#sRegs').textContent = s.total_registrations; qs('#sRegsSub').textContent = 'confirmed registrations';
  qs('#sChecked').textContent = s.total_checked_in; qs('#sRate').textContent = `${s.attendance_rate}%`;

  const chart = qs('#catChart'); const max = Math.max(1, ...s.by_category.map((c) => c.registrations));
  if (!s.by_category.length) chart.append(el('p', { class: 'muted small' }, 'No events yet.'));
  s.by_category.forEach((c) => chart.append(el('div', { class: 'bar-row' }, [el('span', {}, c.category), el('div', { class: 'track' }, el('div', { class: 'fill', style: `width:${Math.round((c.registrations / max) * 100)}%` })), el('span', { class: 'n' }, c.registrations)])));

  const recent = qs('#recent');
  if (!s.recent_registrations.length) recent.append(el('li', {}, el('span', { class: 'muted' }, 'No registrations yet.')));
  s.recent_registrations.forEach((r) => recent.append(el('li', {}, [el('span', {}, [el('strong', {}, r.full_name), ' · ', el('a', { href: `/admin-attendees?event=${r.event_id}` }, r.event_title)]), el('span', {}, fmtShort(r.registered_at))])));

  const tb = qs('#topEvents');
  s.top_events.forEach((e) => tb.append(el('tr', {}, [
    el('td', {}, [el('span', { class: 'title' }, e.title), el('span', { class: 'sub' }, `${e.category} · ${e.venue}`)]),
    el('td', {}, fmtDate(e.start_datetime, { weekday: undefined })), el('td', {}, statusBadge(e.status)),
    el('td', {}, `${e.registered_count} / ${e.capacity}`), el('td', {}, e.checked_in_count),
    el('td', { class: 'actions' }, el('a', { href: `/admin-attendees?event=${e.id}`, class: 'btn btn-ghost btn-sm' }, 'Attendees')),
  ])));
})();
