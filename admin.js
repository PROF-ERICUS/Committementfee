
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

  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------

  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  function setAdminMessage(text, type = 'success') {
    adminMsg.textContent = text;
    adminMsg.className = `form-message ${type}`;
  }

  function statusBadge(status) {
    const labels = {
      pending: 'Pending',
      approved: 'Approved',
      correction: 'Correction Required',
      rejected: 'Rejected',
      printed: 'Printed',
      under_review: 'Under Review'
    };

    return `<span class="pill ${escapeHtml(status)}">${escapeHtml(labels[status] || status)}</span>`;
  }

  // --------------------------------------------------
  // ADMIN SESSION
  // --------------------------------------------------

  async function sessionCheck() {
    if (!sb) return;

    const { data: { session } } = await sb.auth.getSession();

    if (!session) return;

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

  // --------------------------------------------------
  // LOGIN
  // --------------------------------------------------

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

  // --------------------------------------------------
  // DASHBOARD
  // --------------------------------------------------

  async function showDash() {
    loginCard.hidden = true;
    dashboard.hidden = false;
    await loadData();
  }

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
      setAdminMessage(error.message, 'error');

      rows.innerHTML =
        '<tr><td colspan="6" class="empty">Failed to load registrations.</td></tr>';

      return;
    }

    registrations = data || [];
    render();
  }

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

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

      const notePreview = r.admin_notes
        ? `<span class="sub admin-note-preview">${escapeHtml(r.admin_notes)}</span>`
        : '';

      const correctionPreview =
        r.status === 'correction' && Array.isArray(r.correction_fields)
          ? `<span class="sub">Requested fields: ${escapeHtml(r.correction_fields.join(', '))}</span>`
          : '';

      return `
        <tr>
          <td>
            <span class="person">${escapeHtml(fullName)}</span>
            <span class="sub">Submitted ${escapeHtml(submitted)}</span>
            <span class="sub">Ref: ${escapeHtml(r.reference || 'N/A')}</span>
            ${notePreview}
            ${correctionPreview}
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

  // --------------------------------------------------
  // CORRECTION FIELD SELECTION
  // --------------------------------------------------

  function collectCorrection(record) {
    const name = [
      record.first_name,
      record.middle_name,
      record.last_name
    ].filter(Boolean).join(' ');

    const fieldOptions = [
      { key: 'first_name', label: 'First Name' },
      { key: 'middle_name', label: 'Middle Name' },
      { key: 'last_name', label: 'Last Name' },
      { key: 'constituency', label: 'Constituency' },
      { key: 'position', label: 'Position / Appointment' },
      { key: 'receipt', label: 'Payment Receipt' }
    ];

    const selectionText = fieldOptions
      .map((field, index) => `${index + 1}. ${field.label}`)
      .join('\n');

    const selection = window.prompt(
      `REQUEST CORRECTION FROM:\n${name}\n\n` +
      `Select the field(s) that need correction.\n\n` +
      `${selectionText}\n\n` +
      `Enter the number(s), separated by commas.\n` +
      `Example: 1,4,6`
    );

    // Cancel aborts action
    if (selection === null) {
      return null;
    }

    const selectedNumbers = selection
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!selectedNumbers.length) {
      alert('Please select at least one field.');
      return null;
    }

    const validNumbers = ['1', '2', '3', '4', '5', '6'];

    const invalid = selectedNumbers.some(
      (number) => !validNumbers.includes(number)
    );

    if (invalid) {
      alert('Invalid selection. Use numbers 1 to 6.');
      return null;
    }

    const correctionFields = [
      ...new Set(
        selectedNumbers.map(
          (number) => fieldOptions[Number(number) - 1].key
        )
      )
    ];

    const message = window.prompt(
      `CORRECTION MESSAGE FOR ${name}\n\n` +
      `Explain exactly what the applicant must correct:`
    );

    if (message === null) {
      return null;
    }

    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      alert('A correction message is required.');
      return null;
    }

    return {
      fields: correctionFields,
      message: trimmedMessage
    };
  }

  // --------------------------------------------------
  // REJECTION REASON
  // --------------------------------------------------

  function collectRejection(record) {
    const name = [
      record.first_name,
      record.middle_name,
      record.last_name
    ].filter(Boolean).join(' ');

    const reason = window.prompt(
      `REJECTION REASON FOR ${name}\n\n` +
      `Enter a rejection reason.\n` +
      `You may leave it blank if no explanation is required.`
    );

    if (reason === null) {
      return { cancelled: true };
    }

    return {
      cancelled: false,
      note: reason.trim() || null
    };
  }

  // --------------------------------------------------
  // ROW ACTIONS
  // --------------------------------------------------

  rows?.addEventListener('click', async (e) => {
    // View receipt
    const receiptLink = e.target.closest('[data-receipt]');

    if (receiptLink) {
      e.preventDefault();

      const id = receiptLink.dataset.receipt;
      const record = registrations.find((r) => r.id === id);

      if (!record?.receipt_path) {
        setAdminMessage('Receipt path is missing for this record.', 'error');
        return;
      }

      const { data, error } = await sb.storage
        .from('ypg-payment-receipts')
        .createSignedUrl(record.receipt_path, 120);

      if (error) {
        setAdminMessage(error.message, 'error');
        return;
      }

      window.open(data.signedUrl, '_blank', 'noopener');
      return;
    }

    // Action button
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;

    const record = registrations.find((r) => r.id === id);

    if (!record) {
      setAdminMessage('Registration record not found.', 'error');
      return;
    }

    const allowedActions = [
      'approved',
      'rejected',
      'correction',
      'printed'
    ];

    if (!allowedActions.includes(action)) return;

    btn.disabled = true;

    try {
      let adminNote = null;
      let correctionFields = [];

      // Collect correction data
      if (action === 'correction') {
        const correctionData = collectCorrection(record);

        if (!correctionData) {
          btn.disabled = false;
          return;
        }

        adminNote = correctionData.message;
        correctionFields = correctionData.fields;
      }

      // Collect rejection data
      if (action === 'rejected') {
        const rejectionData = collectRejection(record);

        if (rejectionData.cancelled) {
          btn.disabled = false;
          return;
        }

        adminNote = rejectionData.note;
      }

      const actionLabels = {
        approved: 'approve',
        rejected: 'reject',
        correction: 'request correction from',
        printed: 'mark as printed'
      };

      const fullName = [
        record.first_name,
        record.middle_name,
        record.last_name
      ].filter(Boolean).join(' ');

      const confirmationText =
        action === 'correction'
          ? `Request correction from ${fullName}?\n\nFields: ${correctionFields.join(', ')}\n\nMessage: ${adminNote}`
          : action === 'rejected'
              ? `Are you sure you want to reject ${fullName}?\n\nReason: ${adminNote || 'No reason provided'}`
              : `Are you sure you want to ${actionLabels[action]} ${fullName}?`;

      if (!window.confirm(confirmationText)) {
        btn.disabled = false;
        return;
      }

      const updatePayload = {
        status: action,
        reviewed_at: new Date().toISOString(),

        admin_notes:
          action === 'correction' || action === 'rejected'
            ? adminNote
            : null,

        // Correction permissions are reset on all other statuses.
        correction_fields:
          action === 'correction'
            ? correctionFields
            : []
      };

      const { error } = await sb
        .from('ypg_sash_registrations')
        .update(updatePayload)
        .eq('id', id);

      if (error) throw error;

      await loadData();

      const successMessages = {
        approved: 'Registration approved successfully.',
        rejected: 'Registration rejected.',
        correction: `Correction request saved. Requested fields: ${correctionFields.join(', ')}`,
        printed: 'Registration marked as printed.'
      };

      setAdminMessage(successMessages[action], 'success');

    } catch (error) {
      console.error('Admin action error:', error);

      setAdminMessage(
        error.message || 'Failed to update registration.',
        'error'
      );

    } finally {
      btn.disabled = false;
    }
  });

  // --------------------------------------------------
  // LOGOUT
  // --------------------------------------------------

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    if (sb) {
      await sb.auth.signOut();
    }

    dashboard.hidden = true;
    loginCard.hidden = false;
    loginForm?.reset();
  });

  // --------------------------------------------------
  // REFRESH
  // --------------------------------------------------

  document.getElementById('refreshBtn')?.addEventListener('click', loadData);

  // --------------------------------------------------
  // SEARCH
  // --------------------------------------------------

  document.getElementById('searchInput')?.addEventListener('input', render);

  // --------------------------------------------------
  // FILTER
  // --------------------------------------------------

  document.getElementById('statusFilter')?.addEventListener('change', render);

  // --------------------------------------------------
  // CSV EXPORT
  // --------------------------------------------------

  document.getElementById('exportBtn')?.addEventListener('click', () => {
    const approvedRows = registrations.filter(
      (r) => ['approved', 'printed'].includes(r.status)
    );

    if (!approvedRows.length) {
      setAdminMessage(
        'There are no approved registrations to export.',
        'error'
      );
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

    setAdminMessage('Approved registrations exported successfully.', 'success');
  });

  // --------------------------------------------------
  // CONFIGURATION
  // --------------------------------------------------

  if (!sb) {
    loginMsg.textContent =
      'Configure Supabase URL and publishable key in config.js to use admin login.';
    loginMsg.className = 'form-message error';
  } else {
    sessionCheck();
  }
})();
