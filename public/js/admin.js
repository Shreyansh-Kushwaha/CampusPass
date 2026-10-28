/* Shared admin shell: role guard + sidebar. */
(async () => {
  await CP.ready();
  if (!CP.requireRole('admin')) return;
  const nav = CP.qs('#adminNav');
  const page = location.pathname.replace(/\.html$/, '').replace(/^\//, '');
  const items = [
    ['/admin-dashboard', 'Dashboard', '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>'],
    ['/admin-events', 'Events', CP.ICONS.calendar],
    ['/admin-attendees', 'Attendees', '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-5-6.3"/></svg>'],
    ['/admin-checkin', 'Check-in', CP.ICONS.ticket],
    ['/events', 'Public site', '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>'],
  ];
  items.forEach(([href, label, icon]) => nav.append(CP.el('a', { href, class: page === href.slice(1) ? 'active' : '', html: `${icon}<span>${label}</span>` })));
  CP.adminReady = true;
})();
