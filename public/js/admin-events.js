(async () => {
  const { api, el, qs, fmtShort, statusBadge, toast, confirmModal, toLocalInput, showAlert, busy, ICONS, params } = CP;
  await CP.ready(); if (!CP.state.user || CP.state.user.role !== 'admin') return;
  qs('#searchIcon').outerHTML = ICONS.search;
  const rows = qs('#rows'), search = qs('#search'), statusFilter = qs('#statusFilter');
  const { categories } = await api('/api/events/categories');
  let timer;

  async function load() {
    const data = await api(`/api/admin/events?q=${encodeURIComponent(search.value.trim())}&status=${statusFilter.value}`);
    rows.innerHTML = ''; qs('#emptyWrap').innerHTML = '';
    if (!data.events.length) { qs('#emptyWrap').append(CP.emptyState({ title: 'No events', text: 'Create your first event to get started.', script: 'A fresh calendar' })); return; }
    data.events.forEach((e) => {
      const acts = el('div', { class: 'actions' });
      acts.append(el('a', { href: `/admin-attendees?event=${e.id}`, class: 'btn btn-ghost btn-sm' }, `Attendees (${e.registered_count})`));
      acts.append(el('button', { class: 'btn btn-outline btn-sm', onclick: () => openForm(e) }, 'Edit'));
      if (e.status === 'draft') acts.append(el('button', { class: 'btn btn-primary btn-sm', onclick: () => setStatus(e, 'published') }, 'Publish'));
      if (e.status === 'published') acts.append(el('button', { class: 'btn btn-ghost btn-sm', onclick: () => setStatus(e, 'closed') }, 'Close registration'));
      if (e.status === 'closed') acts.append(el('button', { class: 'btn btn-ghost btn-sm', onclick: () => setStatus(e, 'published') }, 'Reopen'));
      if (e.status !== 'cancelled') acts.append(el('button', { class: 'btn btn-danger btn-sm', onclick: () => cancelEvent(e) }, 'Cancel event'));
      if (e.registered_count === 0 && !e.checked_in_count) acts.append(el('button', { class: 'btn btn-danger btn-sm', onclick: () => deleteEvent(e) }, 'Delete'));
      rows.append(el('tr', {}, [
        el('td', {}, [el('span', { class: 'title' }, e.title), el('span', { class: 'sub' }, `${e.category} · ${e.venue}`)]),
        el('td', {}, [fmtShort(e.start_datetime), el('span', { class: 'sub' }, `Deadline ${fmtShort(e.registration_deadline)}`)]),
        el('td', {}, statusBadge(e.status)),
        el('td', {}, [`${e.registered_count} / ${e.capacity}`, el('span', { class: 'sub' }, `${e.checked_in_count} checked in`)]),
        el('td', {}, acts),
      ]));
    });
  }

  async function setStatus(e, status) {
    try { await api(`/api/admin/events/${e.id}/status`, { method: 'PATCH', body: { status } }); toast(`Event ${status}.`, 'success'); load(); } catch (err) { toast(err.message, 'error'); }
  }
  async function cancelEvent(e) {
    if (!await confirmModal({ title: 'Cancel this event?', text: `“${e.title}” will be marked cancelled. ${e.registered_count} registration(s) are kept for records and tickets stop working.`, confirmLabel: 'Cancel event', danger: true })) return;
    setStatus(e, 'cancelled');
  }
  async function deleteEvent(e) {
    if (!await confirmModal({ title: 'Delete permanently?', text: `“${e.title}” has no registrations and will be removed. This cannot be undone.`, confirmLabel: 'Delete', danger: true })) return;
    try { await api(`/api/admin/events/${e.id}`, { method: 'DELETE' }); toast('Event deleted.', 'success'); load(); } catch (err) { toast(err.message, 'error'); }
  }

  function openForm(e) {
    const tpl = qs('#formTpl').content.cloneNode(true);
    const close = () => backdrop.remove();
    const backdrop = el('div', { class: 'modal-backdrop', onclick: (ev) => { if (ev.target === backdrop) close(); } }, el('div', { class: 'modal', role: 'dialog' }, [
      el('div', { class: 'modal-head' }, [el('h3', {}, e ? 'Edit event' : 'New event'), el('button', { class: 'modal-close', onclick: close }, '×')]),
      el('div', { class: 'modal-body' }, tpl),
    ]));
    document.body.append(backdrop);
    const form = qs('#eventForm', backdrop);
    const cat = qs('#f_category', form); categories.forEach((c) => cat.append(el('option', { value: c }, c)));
    if (e) {
      form.title.value = e.title; form.description.value = e.description; form.category.value = e.category; form.venue.value = e.venue;
      form.start_datetime.value = toLocalInput(e.start_datetime); form.end_datetime.value = toLocalInput(e.end_datetime);
      form.registration_deadline.value = toLocalInput(e.registration_deadline); form.capacity.value = e.capacity; form.status.value = e.status;
    } else { form.capacity.value = 100; form.status.value = 'published'; }
    qs('#cancelForm', form).onclick = close;
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const d = CP.formData(form); const alert = qs('#formAlert', form);
      // Client-side validation mirrors the server.
      if (d.title.trim().length < 3) return showAlert(alert, 'Title must be at least 3 characters.');
      if (d.description.trim().length < 10) return showAlert(alert, 'Description must be at least 10 characters.');
      if (!d.start_datetime || !d.end_datetime || !d.registration_deadline) return showAlert(alert, 'All dates are required.');
      if (new Date(d.end_datetime) <= new Date(d.start_datetime)) return showAlert(alert, 'End must be after start.');
      if (new Date(d.registration_deadline) > new Date(d.start_datetime)) return showAlert(alert, 'Deadline must be on or before the start.');
      if (!(Number(d.capacity) >= 1)) return showAlert(alert, 'Capacity must be at least 1.');
      const body = { ...d, capacity: Number(d.capacity), start_datetime: new Date(d.start_datetime).toISOString(), end_datetime: new Date(d.end_datetime).toISOString(), registration_deadline: new Date(d.registration_deadline).toISOString() };
      const btn = qs('#saveBtn', form); busy(btn, true, 'Saving…');
      try {
        await api(e ? `/api/admin/events/${e.id}` : '/api/admin/events', { method: e ? 'PUT' : 'POST', body });
        toast(e ? 'Event updated.' : 'Event created.', 'success'); close(); load();
      } catch (err) { showAlert(alert, err.message); busy(btn, false); }
    };
  }

  qs('#newBtn').onclick = () => openForm(null);
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  statusFilter.addEventListener('change', load);
  if (params().get('new')) openForm(null);
  load();
})();
