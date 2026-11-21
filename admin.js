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

  const loginCard = document.getElementById('loginCard');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('loginForm');
  const loginMsg = document.getElementById('loginMessage');
  const adminMsg = document.getElementById('adminMessage');
  const rows = document.getElementById('rows');

  let registrations = [];

  // HELPERS

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

  // DUPLICATE DETECTION

  function normalizeDuplicateName(record) {
    return [
      record.first_name,
      record.middle_name,
      record.last_name
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function normalizeDuplicatePhone(phone) {
    let digits = String(phone || '').replace(/\D/g, '');

    if (digits.startsWith('00')) digits = digits.slice(2);

    if (digits.length === 10 && digits.startsWith('0')) {
      digits = '233' + digits.slice(1);
    }

    return digits;
  }

  function getDuplicateInfo(record) {
    const name = normalizeDuplicateName(record);
    const phone = normalizeDuplicatePhone(record.phone);

    const samePhone = phone.length >= 9
      ? registrations.filter(r =>
          String(r.id) !== String(record.id) &&
          normalizeDuplicatePhone(r.phone) === phone
        )
      : [];

    const sameName = name.length >= 5
      ? registrations.filter(r =>
          String(r.id) !== String(record.id) &&
          normalizeDuplicateName(r) === name
        )
      : [];

    return {
      isDuplicate: samePhone.length > 0 || sameName.length > 0,
      strong: samePhone.length > 0,
      samePhone,
      sameName
    };
  }

  // DUPLICATE FILTER

  function ensureDuplicateFilterOption() {
    const select = document.getElementById('statusFilter');

    if (
      select &&
      !select.querySelector('option[value="duplicates"]')
    ) {
      const option = document.createElement('option');
      option.value = 'duplicates';
      option.textContent = 'Duplicates only';
      select.appendChild(option);
    }
  }

  // DUPLICATE STYLES

  function injectDuplicateStyles() {
    if (document.getElementById('duplicateHighlightStyles')) return;

    const style = document.createElement('style');
    style.id = 'duplicateHighlightStyles';

    style.textContent = `
      tr.duplicate-phone-row {
        background: #fee2e2 !important;
        outline: 2px solid #ef4444;
        outline-offset: -2px;
      }

      tr.duplicate-name-row {
        background: #fff7ed !important;
        outline: 2px solid #f59e0b;
        outline-offset: -2px;
      }

      .duplicate-badge {
        display: inline-block;
        margin: 5px 0;
        padding: 4px 8px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 800;
      }

      .duplicate-phone-badge {
        background: #fecaca;
        color: #991b1b;
      }

      .duplicate-name-badge {
        background: #fed7aa;
        color: #9a3412;
      }

      .delete-registration-btn {
        background: #dc2626 !important;
        color: #fff !important;
        border: 0 !important;
        padding: 8px 12px !important;
        border-radius: 6px !important;
        cursor: pointer !important;
      }

      .delete-registration-btn:hover {
        background: #b91c1c !important;
      }
    `;

    document.head.appendChild(style);
  }

  // ADMIN SESSION

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

  // LOGIN

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

  // DASHBOARD

  async function showDash() {
    loginCard.hidden = true;
    dashboard.hidden = false;
    injectDuplicateResolver();
    injectDuplicateStyles();
    ensureDuplicateFilterOption();
    await loadData();
  }
    // DUPLICATE SEARCH / PHONE RESOLUTION

  function injectDuplicateResolver() {
    if (document.getElementById('duplicateResolver')) return;

    const panel = document.createElement('section');
    panel.id = 'duplicateResolver';
    panel.style.cssText =
      'margin:20px 0;padding:20px;border:1px solid #dfe7e1;border-radius:12px;background:#f8faf8;';

    panel.innerHTML = `
      <h2 style="margin:0 0 8px;color:#087b42;">
        Resolve Duplicate / Add Missing Phone
      </h2>

      <p style="margin:0 0 14px;color:#666;line-height:1.5;">
        Search registrations, verify the correct record, and attach a phone number
        to a registration that does not already have one.
      </p>

      <label for="duplicateSearch"
        style="display:block;font-weight:600;margin-bottom:6px;">
        Search applicant
      </label>

      <input
        id="duplicateSearch"
        type="search"
        placeholder="Name, constituency, position, or reference"
        style="box-sizing:border-box;width:100%;padding:12px;border:1px solid #d5ddd7;border-radius:8px;margin-bottom:12px;"
      >

      <div id="duplicateMatches" aria-live="polite"></div>
    `;

    dashboard.insertBefore(panel, dashboard.firstChild);

    panel.querySelector('#duplicateSearch')
      .addEventListener('input', renderDuplicateMatches);
  }

  function normalizeAdminPhone(phone) {
    let digits = String(phone || '').replace(/\D/g, '');

    if (digits.startsWith('00')) digits = digits.slice(2);

    if (digits.length === 10 && digits.startsWith('0')) {
      digits = '233' + digits.slice(1);
    }

    if (digits.startsWith('233') && digits.length === 12) {
      return '+' + digits;
    }

    if (digits.length >= 7 && digits.length <= 15) {
      return '+' + digits;
    }

    return '';
  }

  function renderDuplicateMatches() {
    const input = document.getElementById('duplicateSearch');
    const output = document.getElementById('duplicateMatches');

    if (!input || !output) return;

    const query = input.value.trim().toLowerCase();

    if (!query) {
      output.innerHTML =
        '<p style="color:#777;margin:8px 0;">Enter a search term to find registrations.</p>';
      return;
    }

    const matches = registrations.filter((r) => {
      const text = [
        r.first_name,
        r.middle_name,
        r.last_name,
        r.constituency,
        r.position,
        r.reference,
        r.phone
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return text.includes(query);
    }).slice(0, 30);

    if (!matches.length) {
      output.innerHTML =
        '<p style="color:#777;margin:8px 0;">No matching registrations found.</p>';
      return;
    }

    output.innerHTML = matches.map((r) => {
      const name = [
        r.first_name,
        r.middle_name,
        r.last_name
      ].filter(Boolean).join(' ');

      const phoneLabel = r.phone
        ? escapeHtml(r.phone)
        : 'No phone linked';

      const hasPhone = Boolean(String(r.phone || '').trim());

      return `
        <div style="background:#fff;border:1px solid #e2e8e3;border-radius:9px;padding:12px;margin:10px 0;">

          <strong>${escapeHtml(name)}</strong>

          <div style="font-size:13px;color:#666;margin-top:4px;">
            ${escapeHtml(r.position || '')}
            ·
            ${escapeHtml(r.constituency || '')}
          </div>

          <div style="font-size:13px;margin-top:5px;">
            Ref: ${escapeHtml(r.reference || 'N/A')}
            · Phone: ${phoneLabel}
          </div>

          <div style="font-size:13px;margin-top:5px;">
            Status: ${escapeHtml(r.status || 'unknown')}
            · Submitted:
            ${r.created_at
              ? escapeHtml(new Date(r.created_at).toLocaleString())
              : 'Unknown'}
          </div>

          ${
            hasPhone
              ? '<p style="margin:8px 0;color:#666;font-size:13px;">This record already has a phone number.</p>'
              : `
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">

                  <input
                    type="tel"
                    class="resolvePhoneInput"
                    data-id="${escapeHtml(r.id)}"
                    placeholder="Phone to attach (e.g. 0241234567)"
                    style="flex:1;min-width:180px;padding:10px;border:1px solid #d5ddd7;border-radius:7px;"
                  >

                  <button
                    type="button"
                    data-resolve-phone="${escapeHtml(r.id)}"
                    style="padding:10px 14px;border:0;border-radius:7px;background:#087b42;color:#fff;cursor:pointer;"
                  >
                    Attach Phone
                  </button>

                </div>
              `
          }

        </div>
      `;
    }).join('');
  }

  async function attachPhoneToSelectedRecord(recordId, button) {
    const record = registrations.find(
      (r) => String(r.id) === String(recordId)
    );

    const input = document.querySelector(
      `.resolvePhoneInput[data-id="${CSS.escape(String(recordId))}"]`
    );

    if (!record || !input) return;

    const phone = normalizeAdminPhone(input.value);

    if (!phone) {
      setAdminMessage(
        'Enter a valid phone number before attaching.',
        'error'
      );
      input.focus();
      return;
    }

    const duplicatePhone = registrations.some(
      (r) =>
        r.phone &&
        normalizeAdminPhone(r.phone) === phone
    );

    if (duplicatePhone) {
      setAdminMessage(
        'That phone number is already linked to another registration.',
        'error'
      );
      return;
    }

    const name = [
      record.first_name,
      record.middle_name,
      record.last_name
    ].filter(Boolean).join(' ');

    const confirmed = window.confirm(
      `Attach ${phone} to ${name} (Ref: ${record.reference})?

Please verify the applicant and record before proceeding.`
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = 'Updating…';

    try {
      const { data, error } = await sb
        .from('ypg_sash_registrations')
        .update({ phone })
        .eq('id', record.id)
        .is('phone', null)
        .select('id')
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          'This record was already updated or no longer has an empty phone field. Refresh and check the record.'
        );
      }

      setAdminMessage(
        `Phone attached successfully to ${name}. Reference: ${record.reference}`,
        'success'
      );

      await loadData();
      renderDuplicateMatches();

    } catch (error) {
      console.error('Duplicate resolution phone update failed:', error);

      setAdminMessage(
        error.message || 'Could not attach the phone number.',
        'error'
      );

    } finally {
      button.disabled = false;
      button.textContent = 'Attach Phone';
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-resolve-phone]');
    if (!button) return;

    attachPhoneToSelectedRecord(
      button.dataset.resolvePhone,
      button
    );
  });

  // LOAD REGISTRATION DATA

  async function loadData() {
    if (!sb) return;

    rows.innerHTML =
      '<tr><td colspan="7" class="empty">Loading records…</td></tr>';

    adminMsg.textContent = '';

    const { data, error } = await sb
      .from('ypg_sash_registrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setAdminMessage(error.message, 'error');

      rows.innerHTML =
        '<tr><td colspan="7" class="empty">Failed to load registrations.</td></tr>';

      return;
    }

    registrations = data || [];
    render();
  }
    // RENDER DASHBOARD

  function render() {
    ensureDuplicateFilterOption();

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
        r.phone,
        r.constituency,
        r.position,
        r.reference
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = searchable.includes(q);
      const duplicateInfo = getDuplicateInfo(r);

      const matchesStatus =
        filter === 'all' ||
        (filter === 'duplicates'
              ? duplicateInfo.isDuplicate
              : r.status === filter);

      return matchesSearch && matchesStatus;
    });

    if (!filtered.length) {
      rows.innerHTML =
        '<tr><td colspan="7" class="empty">No registrations found.</td></tr>';
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
      const phone = r.phone || 'Not provided';

      const duplicateInfo = getDuplicateInfo(r);

      let duplicateBadge = '';
      let duplicateRowClass = '';

      if (duplicateInfo.strong) {
        duplicateBadge = `
          <span class="duplicate-badge duplicate-phone-badge">
            ⚠ DUPLICATE PHONE
          </span>
        `;
        duplicateRowClass = 'duplicate-phone-row';
      } else if (duplicateInfo.sameName.length > 0) {
        duplicateBadge = `
          <span class="duplicate-badge duplicate-name-badge">
            ⚠ POSSIBLE DUPLICATE NAME
          </span>
        `;
        duplicateRowClass = 'duplicate-name-row';
      }

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
        <tr class="${duplicateRowClass}">
          <td>
            <span class="person">${escapeHtml(fullName)}</span>
            ${duplicateBadge}
            <span class="sub">Submitted ${escapeHtml(submitted)}</span>
            <span class="sub">Ref: ${escapeHtml(r.reference || 'N/A')}</span>
            ${notePreview}
            ${correctionPreview}
          </td>

          <td>${escapeHtml(phone)}</td>

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
              <button
                data-action="delete"
                data-id="${escapeHtml(r.id)}"
                class="delete-registration-btn"
              >Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // CORRECTION FIELD SELECTION

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
      { key: 'phone', label: 'Phone Number' },
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
      `Example: 1,4,6,7`
    );

    if (selection === null) return null;

    const selectedNumbers = selection
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);

    if (!selectedNumbers.length) {
      alert('Please select at least one field.');
      return null;
    }

    const validNumbers = ['1', '2', '3', '4', '5', '6', '7'];

    if (selectedNumbers.some(n => !validNumbers.includes(n))) {
      alert('Invalid selection. Use numbers 1 to 7.');
      return null;
    }

    const correctionFields = [
      ...new Set(
        selectedNumbers.map(
          number => fieldOptions[Number(number) - 1].key
        )
      )
    ];

    const message = window.prompt(
      `CORRECTION MESSAGE FOR ${name}\n\n` +
      `Explain exactly what the applicant must correct:`
    );

    if (message === null || !message.trim()) {
      alert('A correction message is required.');
      return null;
    }

    return {
      fields: correctionFields,
      message: message.trim()
    };
  }

  // REJECTION REASON

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

  // ROW ACTIONS
    rows?.addEventListener('click', async (e) => {
    // VIEW RECEIPT
    const receiptLink = e.target.closest('[data-receipt]');

    if (receiptLink) {
      e.preventDefault();

      const id = receiptLink.dataset.receipt;
      const record = registrations.find(
        r => String(r.id) === String(id)
      );

      if (!record?.receipt_path) {
        setAdminMessage(
          'Receipt path is missing for this record.',
          'error'
        );
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

    // ACTION BUTTON
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;

    const record = registrations.find(
      r => String(r.id) === String(id)
    );

    if (!record) {
      setAdminMessage('Registration record not found.', 'error');
      return;
    }

    const allowedActions = [
      'approved',
      'rejected',
      'correction',
      'printed',
      'delete'
    ];

    if (!allowedActions.includes(action)) return;

    btn.disabled = true;

    const fullName = [
      record.first_name,
      record.middle_name,
      record.last_name
    ].filter(Boolean).join(' ');

    // DELETE REGISTRATION
    if (action === 'delete') {
      const confirmed = window.confirm(
        `PERMANENT DELETE\n\n` +
        `Are you sure you want to permanently delete:\n\n` +
        `${fullName}\n\n` +
        `Reference: ${record.reference || 'N/A'}\n\n` +
        `This action cannot be undone.`
      );

      if (!confirmed) {
        btn.disabled = false;
        return;
      }

      btn.textContent = 'Deleting…';

      try {
        const { error } = await sb
          .from('ypg_sash_registrations')
          .delete()
          .eq('id', record.id);

        if (error) throw error;

        setAdminMessage(
          `${fullName} has been permanently deleted.`,
          'success'
        );

        await loadData();
        renderDuplicateMatches();

      } catch (error) {
        console.error('Delete registration error:', error);

        setAdminMessage(
          error.message || 'Failed to delete registration.',
          'error'
        );

      } finally {
        btn.disabled = false;
        btn.textContent = 'Delete';
      }

      return;
    }

    try {
      let adminNote = null;
      let correctionFields = [];

      // COLLECT CORRECTION DATA
      if (action === 'correction') {
        const correctionData = collectCorrection(record);

        if (!correctionData) {
          btn.disabled = false;
          return;
        }

        adminNote = correctionData.message;
        correctionFields = correctionData.fields;
      }

      // COLLECT REJECTION DATA
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

  // LOGOUT

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    if (sb) {
      await sb.auth.signOut();
    }

    dashboard.hidden = true;
    loginCard.hidden = false;
    loginForm?.reset();
  });

  // REFRESH

  document.getElementById('refreshBtn')?.addEventListener('click', loadData);

  // SEARCH

  document.getElementById('searchInput')?.addEventListener('input', render);

  // FILTER

  document.getElementById('statusFilter')?.addEventListener('change', render);
    // CSV EXPORT

  document.getElementById('exportBtn')?.addEventListener('click', () => {
    const approvedRows = registrations.filter(
      r => ['approved', 'printed'].includes(r.status)
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
      'Phone',
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
      ...approvedRows.map(r => [
        r.first_name,
        r.middle_name,
        r.last_name,
        r.phone,
        r.constituency,
        r.position,
        r.reference,
        r.status,
        r.created_at
          ? new Date(r.created_at).toLocaleString()
          : ''
      ])
    ]
      .map(row => row.map(quote).join(','))
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

    setAdminMessage(
      'Approved registrations exported successfully.',
      'success'
    );
  });

  // CONFIGURATION

  if (!sb) {
    loginMsg.textContent =
      'Configure Supabase URL and publishable key in config.js to use admin login.';
    loginMsg.className = 'form-message error';
  } else {
    sessionCheck();
  }

})();
