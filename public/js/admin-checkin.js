(async () => {
  const { api, el, qs, fmtShort, toast, params, busy } = CP;
  await CP.ready(); if (!CP.state.user || CP.state.user.role !== 'admin') return;
  const sel = qs('#eventSelect'), result = qs('#result'), log = qs('#log'), tokenInput = qs('#token');
  const video = qs('#video'), canvas = qs('#canvas'), overlay = qs('#overlay'), reticle = qs('#reticle');
  let stream = null, scanning = false, lastToken = '', lastAt = 0, count = 0;

  const { events } = await api('/api/admin/events?limit=200');
  const active = events.filter((e) => e.status !== 'draft' && e.status !== 'cancelled');
  if (!active.length) { sel.append(el('option', {}, 'No active events')); return; }
  active.forEach((e) => sel.append(el('option', { value: e.id }, `${e.title} · ${fmtShort(e.start_datetime)}`)));
  const wanted = Number(params().get('event'));
  if (active.some((e) => e.id === wanted)) sel.value = wanted;

  function render(res, action) {
    const t = res.ticket;
    result.className = `result-card ${res.ok ? 'valid' : 'invalid'}`;
    result.innerHTML = '';
    const heading = res.ok ? (action === 'verify' ? 'Valid ticket' : 'Checked in ✓') : ({ invalid: 'Invalid ticket', already_used: 'Already used', wrong_event: 'Wrong event', cancelled: 'Cancelled registration', event_cancelled: 'Event cancelled' }[res.code] || 'Rejected');
    result.append(el('div', { class: 'status' }, heading), el('p', { style: 'margin-bottom:1rem' }, res.message));
    if (t) {
      result.append(el('ul', { class: 'info-list' }, [
        el('li', {}, [el('span', { class: 'k' }, 'Attendee'), el('span', { class: 'v' }, t.student_name)]),
        el('li', {}, [el('span', { class: 'k' }, 'Email'), el('span', { class: 'v' }, t.student_email)]),
        el('li', {}, [el('span', { class: 'k' }, 'Event'), el('span', { class: 'v' }, t.event_title)]),
        el('li', {}, [el('span', { class: 'k' }, 'Ticket'), el('span', { class: 'v mono' }, t.ticket_token)]),
        el('li', {}, [el('span', { class: 'k' }, 'Checked in'), el('span', { class: 'v' }, t.checked_in_at ? fmtShort(t.checked_in_at) : '—')]),
      ]));
      if (res.ok && action === 'verify') {
        const b = el('button', { class: 'btn btn-primary', style: 'margin-top:1rem' }, 'Check in now');
        b.onclick = () => submit(t.ticket_token, 'checkin'); result.append(b);
      }
    }
    if (action === 'checkin') {
      count++; qs('#logCount').textContent = `${count} scanned`;
      log.prepend(el('li', {}, [el('span', {}, [el('strong', { style: `color:${res.ok ? 'var(--success)' : 'var(--danger)'}` }, res.ok ? '✓ ' : '✗ '), t ? t.student_name : (res.rawToken || 'Unknown code'), ' — ', heading]), el('span', {}, new Date().toLocaleTimeString())]));
    }
    try { if (navigator.vibrate) navigator.vibrate(res.ok ? 80 : [60, 40, 60]); } catch (_) {}
  }

  async function submit(token, action) {
    token = (token || '').trim();
    if (!token) return toast('Enter or scan a ticket code.', 'error');
    try {
      const res = await api(action === 'verify' ? '/api/admin/checkin/verify' : '/api/admin/checkin', { method: 'POST', body: { token, event_id: Number(sel.value) }, raw: true });
      const data = await res.json();
      if (res.status >= 400 && data.error) { toast(data.error, 'error'); return; }
      render({ ...data, rawToken: token }, action);
    } catch (err) { toast(err.message, 'error'); }
  }

  qs('#manualForm').onsubmit = (e) => { e.preventDefault(); submit(tokenInput.value, 'checkin'); tokenInput.select(); };
  qs('#verifyBtn').onclick = () => submit(tokenInput.value, 'verify');

  // ---- Camera scanning via jsQR ----
  async function startCam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast('Camera is not available in this browser. Use manual entry.', 'error');
    if (typeof jsQR !== 'function') return toast('QR library failed to load. Use manual entry.', 'error');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream; await video.play();
      video.classList.remove('hidden'); overlay.classList.add('hidden'); reticle.classList.remove('hidden'); qs('#stopCam').classList.remove('hidden');
      qs('#camStatus').textContent = 'Camera on — point at a ticket QR code'; scanning = true; requestAnimationFrame(tick);
    } catch (err) { toast('Could not access the camera: ' + err.message, 'error'); }
  }
  function stopCam() {
    scanning = false; if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null;
    video.classList.add('hidden'); overlay.classList.remove('hidden'); reticle.classList.add('hidden'); qs('#stopCam').classList.add('hidden'); qs('#camStatus').textContent = 'Camera off';
  }
  function tick() {
    if (!scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data) {
        const now = Date.now();
        if (code.data !== lastToken || now - lastAt > 4000) { lastToken = code.data; lastAt = now; tokenInput.value = code.data; submit(code.data, 'checkin'); }
      }
    }
    requestAnimationFrame(tick);
  }
  qs('#startCam').onclick = startCam; qs('#stopCam').onclick = stopCam;
  window.addEventListener('beforeunload', stopCam);
  tokenInput.focus();
})();
