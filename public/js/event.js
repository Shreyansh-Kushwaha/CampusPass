(async () => {
  const { api, el, qs, params, fmtDate, fmtTime, fmtDateTime, availabilityBadge, toast, busy, state, confirmModal } = CP;
  await CP.ready();
  const root = qs('#eventPage');
  const id = Number(params().get('id'));
  let ev, myReg = null;
  try { ({ event: ev } = await api(`/api/events/${id}`)); }
  catch (err) { root.innerHTML = ''; root.append(el('section', { class: 'section' }, el('div', { class: 'container' }, CP.emptyState({ title: 'Event not found', text: err.message, action: { href: '/events', label: 'Back to events' } })))); return; }
  document.title = `${ev.title} · CampusPass`;

  if (state.user && state.user.role === 'student') {
    const { registrations } = await api('/api/registrations');
    myReg = registrations.find((r) => r.event_id === ev.id && r.registration_status === 'confirmed') || null;
  }

  const pct = Math.min(100, Math.round((ev.registered_count / ev.capacity) * 100));
  const AVAIL_TEXT = {
    open: `${ev.seats_left} of ${ev.capacity} seats remaining. Register before ${fmtDateTime(ev.registration_deadline)}.`,
    full: 'This event has reached capacity.',
    closed: 'Registration for this event is closed.',
    cancelled: 'This event has been cancelled by the organisers.',
    ended: 'This event has already taken place.',
  };

  function actionBlock() {
    const box = el('div', {});
    if (myReg) {
      box.append(el('div', { class: 'alert alert-success' }, 'You are registered for this event.'),
        el('a', { href: `/ticket?id=${myReg.id}`, class: 'btn btn-primary btn-block' }, 'View my ticket'));
      return box;
    }
    if (ev.availability !== 'open') { box.append(el('p', { class: 'muted small' }, AVAIL_TEXT[ev.availability])); return box; }
    if (!state.user) {
      box.append(el('a', { href: `/login?next=${encodeURIComponent(location.pathname + location.search)}`, class: 'btn btn-primary btn-block' }, 'Log in to register'),
        el('p', { class: 'muted small', style: 'text-align:center;margin-top:.75rem' }, ['No account? ', el('a', { href: '/register' }, 'Create one')]));
      return box;
    }
    if (state.user.role === 'admin') { box.append(el('a', { href: `/admin-attendees?event=${ev.id}`, class: 'btn btn-outline btn-block' }, 'Manage attendees')); return box; }
    const btn = el('button', { class: 'btn btn-primary btn-block btn-lg' }, 'Register for this event');
    btn.onclick = async () => {
      busy(btn, true, 'Securing your seat…');
      try {
        const { ticket } = await api('/api/registrations', { method: 'POST', body: { event_id: ev.id } });
        toast('Registered! Your ticket is ready.', 'success');
        location.href = `/ticket?id=${ticket.id}&new=1`;
      } catch (err) { toast(err.message, 'error'); busy(btn, false); if (err.status === 409 || err.status === 400) setTimeout(() => location.reload(), 1200); }
    };
    box.append(btn, el('p', { class: 'muted small', style: 'text-align:center;margin-top:.75rem' }, 'Free to attend · instant QR ticket'));
    return box;
  }

  root.innerHTML = '';
  root.append(
    el('section', { class: 'detail-head' }, el('div', { class: 'container' }, [
      el('div', { class: 'row', style: 'margin-bottom:1rem' }, [el('span', { class: 'badge badge-category' }, ev.category), availabilityBadge(ev.availability)]),
      el('h1', {}, ev.title),
      el('p', { class: 'lede' }, `${fmtDate(ev.start_datetime)} · ${fmtTime(ev.start_datetime)} – ${fmtTime(ev.end_datetime)} · ${ev.venue}`),
    ])),
    el('section', { class: 'section', style: 'padding-top:2.5rem' }, el('div', { class: 'container detail-grid' }, [
      el('div', {}, [el('span', { class: 'eyebrow' }, 'About this event'), el('p', { class: 'detail-body' }, ev.description)]),
      el('aside', { class: 'card sticky' }, el('div', { class: 'card-body' }, [
        el('ul', { class: 'info-list' }, [
          el('li', {}, [el('span', { class: 'k' }, 'Starts'), el('span', { class: 'v' }, fmtDateTime(ev.start_datetime))]),
          el('li', {}, [el('span', { class: 'k' }, 'Ends'), el('span', { class: 'v' }, fmtDateTime(ev.end_datetime))]),
          el('li', {}, [el('span', { class: 'k' }, 'Venue'), el('span', { class: 'v' }, ev.venue)]),
          el('li', {}, [el('span', { class: 'k' }, 'Deadline'), el('span', { class: 'v' }, fmtDateTime(ev.registration_deadline))]),
          el('li', {}, [el('span', { class: 'k' }, 'Capacity'), el('span', { class: 'v' }, `${ev.registered_count} / ${ev.capacity} registered`)]),
        ]),
        el('div', { class: 'capacity-bar', style: 'width:100%;margin:1rem 0 1.5rem' }, el('i', { style: `width:${pct}%` })),
        actionBlock(),
      ])),
    ])),
  );
})();
