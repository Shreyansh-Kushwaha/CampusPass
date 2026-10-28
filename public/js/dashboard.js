(async () => {
  const { api, el, qs, dateBlock, fmtDate, fmtTime, emptyState, toast, confirmModal, requireRole, state } = CP;
  await CP.ready();
  if (!requireRole('student')) return;
  const hour = new Date().getHours();
  qs('#greetScript').textContent = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  qs('#greeting').textContent = state.user.full_name;

  async function load() {
    const { registrations } = await api('/api/registrations');
    const confirmed = registrations.filter((r) => r.registration_status === 'confirmed');
    const upcoming = confirmed.filter((r) => !r.is_past && r.event_status !== 'cancelled');
    const past = registrations.filter((r) => !upcoming.includes(r));
    qs('#sTotal').textContent = confirmed.length;
    qs('#sUpcoming').textContent = upcoming.length;
    qs('#sTickets').textContent = upcoming.filter((r) => !r.checked_in_at).length;
    qs('#sAttended').textContent = confirmed.filter((r) => r.checked_in_at).length;
    qs('#greetSub').textContent = upcoming.length ? `You have ${upcoming.length} upcoming ${upcoming.length === 1 ? 'event' : 'events'}.` : 'Your registrations and tickets, all in one place.';

    const up = qs('#upcomingList'); up.innerHTML = '';
    if (!upcoming.length) up.append(emptyState({ script: 'A blank calendar', title: 'No upcoming events yet', text: 'Browse the programme and register for something that excites you. Your tickets will appear here.', action: { href: '/events', label: 'Browse events' } }));
    upcoming.forEach((r) => up.append(row(r)));

    const pastSec = qs('#pastSection'), pl = qs('#pastList'); pl.innerHTML = '';
    pastSec.classList.toggle('hidden', !past.length);
    past.forEach((r) => pl.append(row(r, true)));
  }

  function statusBadge(r) {
    if (r.registration_status === 'cancelled') return el('span', { class: 'badge badge-cancelled' }, 'Cancelled');
    if (r.event_status === 'cancelled') return el('span', { class: 'badge badge-cancelled' }, 'Event cancelled');
    if (r.checked_in_at) return el('span', { class: 'badge badge-checked' }, 'Attended');
    if (r.is_past) return el('span', { class: 'badge badge-ended' }, 'Missed');
    return el('span', { class: 'badge badge-confirmed' }, 'Confirmed');
  }

  function row(r, past = false) {
    const actions = el('div', { class: 'actions' });
    if (r.registration_status === 'confirmed') actions.append(el('a', { href: `/ticket?id=${r.id}`, class: 'btn btn-outline btn-sm' }, 'View ticket'));
    if (!past && !r.checked_in_at) {
      const c = el('button', { class: 'btn btn-ghost btn-sm' }, 'Cancel');
      c.onclick = async () => {
        if (!await confirmModal({ title: 'Cancel registration?', text: `Your seat for “${r.event_title}” will be released and your ticket will stop working.`, confirmLabel: 'Cancel registration', danger: true })) return;
        try { await api(`/api/registrations/${r.id}`, { method: 'DELETE' }); toast('Registration cancelled.', 'success'); load(); } catch (err) { toast(err.message, 'error'); }
      };
      actions.append(c);
    }
    return el('div', { class: 'ticket-row' }, [
      dateBlock(r.start_datetime),
      el('div', {}, [
        el('div', { class: 'row', style: 'gap:.5rem;margin-bottom:.25rem' }, [el('span', { class: 'badge badge-category' }, r.category), statusBadge(r)]),
        el('h3', {}, el('a', { href: `/event?id=${r.event_id}` }, r.event_title)),
        el('div', { class: 'muted small' }, `${fmtDate(r.start_datetime)} · ${fmtTime(r.start_datetime)} · ${r.venue}`),
        el('div', { class: 'mono muted', style: 'margin-top:.3rem' }, r.ticket_token),
      ]),
      actions,
    ]);
  }
  load();
})();
