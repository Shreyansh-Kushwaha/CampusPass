(async () => {
  const { api, qs, formData, showAlert, busy, state, params } = CP;
  await CP.ready();
  const next = params().get('next');
  const dest = (u) => (next && next.startsWith('/') && !next.startsWith('//')) ? next : (u.role === 'admin' ? '/admin-dashboard' : '/student-dashboard');
  if (state.user) { location.replace(dest(state.user)); return; }

  const form = qs('#loginForm') || qs('#registerForm');
  const isLogin = form.id === 'loginForm';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alert = qs('#alert'), btn = qs('#submitBtn');
    const data = formData(form);
    form.querySelectorAll('.field').forEach((f) => f.classList.remove('invalid'));
    // Client-side validation (server validates again).
    if (!isLogin) {
      if (data.full_name.trim().length < 2) return mark('full_name', 'Please enter your full name.');
      if (data.password.length < 8) return mark('password', 'Password must be at least 8 characters.');
      if (data.password !== data.confirm_password) return mark('confirm_password', 'Passwords do not match.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return mark('email', 'Please enter a valid email address.');
    function mark(field, msg) { qs(`#${field}`).closest('.field').classList.add('invalid'); showAlert(alert, msg); qs(`#${field}`).focus(); }

    busy(btn, true, isLogin ? 'Logging in…' : 'Creating account…');
    try {
      const res = await api(isLogin ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: data });
      state.user = res.user; state.csrfToken = res.csrfToken;
      location.href = dest(res.user);
    } catch (err) { showAlert(alert, err.message); busy(btn, false); }
  });
})();
