
(() => {
  const ready =
    window.YPG_SUPABASE_URL &&
    !window.YPG_SUPABASE_URL.includes('YOUR_PROJECT') &&
    window.YPG_SUPABASE_ANON_KEY &&
    !window.YPG_SUPABASE_ANON_KEY.includes('YOUR_SUPABASE') &&
    window.supabase;

  const sb = ready
    ? window.supabase.createClient(
        window.YPG_SUPABASE_URL,
        window.YPG_SUPABASE_ANON_KEY
      )
    : null;

  // DOM elements
  const loginCard = document.getElementById('loginCard');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('loginForm');
  const loginMsg = document.getElementById('loginMessage');
  const adminMsg = document.getElementById('adminMessage');
  const rows = document.getElementById('rows');

  let registrations = [];

  // Escape HTML
  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  // Status badge
  function statusBadge(status) {
    return `<span class="pill ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
  }

  // Admin session check
  async function sessionCheck() {
    if (!sb) return;

    const { data: { session } } = await sb.auth.getSession();

    if (session) {
      const { data: admin, error } = await sb
        .from('ypg_sash_admins')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!error && admin) {
        await showDash();
      } else {
        await sb.auth.signOut();
      }
    }
  }

  // Login
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    loginMsg.textContent = '';

    if (!sb) {
      loginMsg.textContent =
        'Supabase configuration is missing in config.js.';
      loginMsg.className = 'form-message error';
      return;
    }

    const f = new FormData(loginForm);

    const { error } = await sb.auth.signInWithPassword({
      email: f.get('email'),
      password: f.get('password')
    });

    if (error) {
      loginMsg.textContent = error.message;
      loginMsg.className = 'form-message error';
      return;
    }

    await sessionCheck();

    if (dashboard.hidden) {
      loginMsg.textContent =
        'This account is not authorized as an admin.';
      loginMsg.className = 'form-message error';
    }
  });

  // Show dashboard
  async function showDash() {
    loginCard.hidden = true;
    dashboard.hidden = false;
    await loadData();
  }

  // Load registrations
  async function loadData() {
    if (!sb) return;

    rows.innerHTML =
      '<tr><td colspan="6" class="empty">Loading records…</td></tr>';

    adminMsg.textContent = '';

    const { data, error } = await sb
      .from('ypg_sash_registrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      adminMsg.textContent = error.message;
      adminMsg.className = 'form-message error';

      rows.innerHTML =
        '<tr><td colspan="6" class="empty">Failed to load registrations.</td></tr>';

      return;
    }

    registrations = data || [];
    render();
  }

  // Render dashboard
  function render() {
    const total = registrations.length;

    const pending = registrations.filter(
      (r) => r.status === 'pending'
    ).length;

    const approved = registrations.filter(
      (r) => ['approved', 'printed'].includes(r.status)
    ).length;

    const other = registrations.filter(
      (r) => ['rejected', 'correction'].includes(r.status)
    ).length;

    document.getElementById('totalCount').textContent = total;
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('approvedCount').textContent = approved;
    document.getElementById('otherCount').textContent = other;

    // Search by name, constituency, or position
    const q = (
      document.getElementById('searchInput')?.value || ''
    ).toLowerCase().trim();

    const filter =
      document.getElementById('statusFilter')?.value || 'all';

    const filtered = registrations.filter((r) => {
      const searchable = [
        r.first_name,
        r.middle_name,
        r.last_name,
        r.constituency,
        r.position,
        r.reference
      ].filter(Boolean).join(' ').toLowerCase();

      const matchesSearch = searchable.includes(q);
      const matchesStatus = filter === 'all' || r.status === filter;

      return matchesSearch && matchesStatus;
    });

    if (!filtered.length) {
      rows.innerHTML =
        '<tr><td colspan="6" class="empty">No registrations found.</td></tr>';
      return;
    }

    rows.innerHTML = filtered.map((r) => {
      const fullName = [
        r.first_name,
        r.middle_name,
        r.last_name
      ].filter(Boolean).join(' ');

      const submitted = r.created_at
        ? new Date(r.created_at).toLocaleString()
        : 'Unknown';

      const constituency = r.constituency || 'Not provided';

      const printButton =
        r.status === 'approved'
          ? `<button data-action="printed" data-id="${escapeHtml(r.id)}">Mark printed</button>`
          : '';

      return `
        <tr>
          <td>
            <span class="person">${escapeHtml(fullName)}</span>
            <span class="sub">Submitted ${escapeHtml(submitted)}</span>
            <span class="sub">Ref: ${escapeHtml(r.reference || 'N/A')}</span>
          </td>

          <td>${escapeHtml(constituency)}</td>

          <td>${escapeHtml(r.position || '')}</td>

          <td>
            ${
              r.receipt_path
                ? `<a href="#" class="receipt-link" data-receipt="${escapeHtml(r.id)}">View receipt</a>`
                : 'No receipt'
            }
          </td>

          <td>${statusBadge(r.status)}</td>

          <td>
            <div class="actions">
              <button data-action="approved" data-id="${escapeHtml(r.id)}">Approve</button>
              <button data-action="rejected" data-id="${escapeHtml(r.id)}">Reject</button>
              <button data-action="correction" data-id="${escapeHtml(r.id)}">Correction</button>
              ${printButton}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Row actions: attached ONCE, outside loadData()
  rows?.addEventListener('click', async (e) => {
    // View receipt
    const receiptLink = e.target.closest('[data-receipt]');

    if (receiptLink) {
      e.preventDefault();

      const id = receiptLink.dataset.receipt;
      const record = registrations.find((r) => r.id === id);

      if (!record?.receipt_path) {
        adminMsg.textContent = 'Receipt path is missing for this record.';
        adminMsg.className = 'form-message error';
        return;
      }

      const { data, error } = await sb.storage
        .from('ypg-payment-receipts')
        .createSignedUrl(record.receipt_path, 120);

      if (error) {
        adminMsg.textContent = error.message;
        adminMsg.className = 'form-message error';
        return;
      }

      window.open(data.signedUrl, '_blank', 'noopener');
      return;
    }

    // Registration actions
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;

    btn.disabled = true;

    const { error } = await sb
      .from('ypg_sash_registrations')
      .update({
        status: action,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      adminMsg.textContent = error.message;
      adminMsg.className = 'form-message error';
      btn.disabled = false;
      return;
    }

    await loadData();

    adminMsg.textContent = `Record updated: ${action}.`;
    adminMsg.className = 'form-message success';
  });

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    if (sb) {
      await sb.auth.signOut();
    }

    dashboard.hidden = true;
    loginCard.hidden = false;
    loginForm?.reset();
  });

  // Refresh
  document.getElementById('refreshBtn')?.addEventListener('click', loadData);

  // Search
  document.getElementById('searchInput')?.addEventListener('input', render);

  // Status filter
  document.getElementById('statusFilter')?.addEventListener('change', render);

  // CSV Export
  document.getElementById('exportBtn')?.addEventListener('click', () => {
    const approvedRows = registrations.filter(
      (r) => ['approved', 'printed'].includes(r.status)
    );

    if (!approvedRows.length) {
      adminMsg.textContent =
        'There are no approved registrations to export.';
      adminMsg.className = 'form-message error';
      return;
    }

    const headers = [
      'First Name',
      'Middle Name',
      'Last Name',
      'Constituency',
      'Position',
      'Reference',
      'Status',
      'Registration Date'
    ];

    const quote = (v) =>
      `"${String(v ?? '').replace(/"/g, '""')}"`;

    const csv = [
      headers,
      ...approvedRows.map((r) => [
        r.first_name,
        r.middle_name,
        r.last_name,
        r.constituency,
        r.position,
        r.reference,
        r.status,
        r.created_at
          ? new Date(r.created_at).toLocaleString()
          : ''
      ])
    ]
      .map((row) => row.map(quote).join(','))
      .join('\r\n');

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'YPG_approved_sash_registrations.csv';

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);

    adminMsg.textContent = 'Approved registrations exported successfully.';
    adminMsg.className = 'form-message success';
  });

  // Configuration check
  if (!sb) {
    loginMsg.textContent =
      'Configure Supabase URL and publishable key in config.js to use admin login.';
    loginMsg.className = 'form-message error';
  } else {
    sessionCheck();
  }
})();
