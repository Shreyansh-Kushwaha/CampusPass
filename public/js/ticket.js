(async () => {
  const { api, el, qs, params, fmtDate, fmtTime, emptyState, requireRole, toast } = CP;
  await CP.ready();
  if (!requireRole()) return;
  const wrap = qs('#ticketWrap');
  const id = Number(params().get('id'));
  let data;
  try { data = await api(`/api/registrations/${id}`); }
  catch (err) { wrap.innerHTML = ''; wrap.append(emptyState({ title: 'Ticket not found', text: err.message, action: { href: '/student-dashboard', label: 'Back to dashboard' } })); return; }
  const t = data.ticket;
  document.title = `Ticket · ${t.event_title} · CampusPass`;

  const status = t.registration_status === 'cancelled' ? ['Cancelled', 'badge-cancelled']
    : t.event_status === 'cancelled' ? ['Event cancelled', 'badge-cancelled']
    : t.checked_in_at ? ['Checked in', 'badge-checked'] : ['Confirmed', 'badge-confirmed'];

  wrap.innerHTML = '';
  if (params().get('new')) wrap.append(el('div', { class: 'alert alert-success no-print', style: 'max-width:760px;margin:0 auto 1.5rem' }, 'Registration confirmed. Save or print this ticket and show the QR code at the entrance.'));
  wrap.append(
    el('article', { class: 'ticket' }, [
      el('div', { class: 'ticket-main' }, [
        el('span', { class: 'script' }, 'Admit one'),
        el('span', { class: 'eyebrow' }, 'CampusPass · Digital Ticket'),
        el('h2', {}, t.event_title),
        el('div', { class: 'ticket-info' }, [
          info('Guest', t.student_name), info('Status', el('span', { class: `badge ${status[1]}` }, status[0])),
          info('Date', fmtDate(t.start_datetime)), info('Time', `${fmtTime(t.start_datetime)} – ${fmtTime(t.end_datetime)}`),
          info('Venue', t.venue), info('Category', t.category),
        ]),
        el('p', { class: 'muted small', style: 'margin:0' }, `Registered ${new Date(t.registered_at).toLocaleString()}${t.checked_in_at ? ` · Checked in ${new Date(t.checked_in_at).toLocaleString()}` : ''}`),
      ]),
      el('div', { class: 'ticket-side' }, [
        el('img', { src: data.qr, alt: `QR code for ticket ${t.ticket_token}`, width: 180, height: 180 }),
        el('div', { class: 'ticket-code' }, t.ticket_token),
        el('span', { class: 'hint' }, 'Present this code at the entrance'),
      ]),
    ]),
    el('div', { class: 'ticket-actions no-print' }, [
      el('a', { href: `/api/registrations/${t.id}/qr.png`, class: 'btn btn-primary', download: '' }, 'Download QR code'),
      el('button', { class: 'btn btn-outline', onclick: () => window.print() }, 'Print ticket'),
      el('button', { class: 'btn btn-ghost', onclick: async () => { try { await navigator.clipboard.writeText(t.ticket_token); toast('Ticket code copied.', 'success'); } catch (_) { toast('Could not copy.', 'error'); } } }, 'Copy code'),
      el('a', { href: '/student-dashboard', class: 'btn btn-ghost' }, 'My tickets'),
    ]),
  );
  function info(k, v) { return el('div', {}, [el('span', { class: 'k' }, k), el('div', { class: 'v' }, v)]); }
})();
