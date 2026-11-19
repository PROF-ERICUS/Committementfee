
(() => {
  const form = document.getElementById('trackForm');
  const referenceInput = document.getElementById('reference');
  const trackBtn = document.getElementById('trackBtn');
  const message = document.getElementById('trackMessage');
  const result = document.getElementById('trackResult');

  const supabaseReady =
    window.YPG_SUPABASE_URL &&
    window.YPG_SUPABASE_ANON_KEY;

  const supabase = supabaseReady
    ? window.supabase.createClient(
        window.YPG_SUPABASE_URL,
        window.YPG_SUPABASE_ANON_KEY
      )
    : null;

  // Automatically load reference from URL
  const params = new URLSearchParams(window.location.search);
  const urlReference = params.get('reference');

  if (urlReference) {
    referenceInput.value = urlReference;
    lookupRegistration(urlReference);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const reference = referenceInput.value.trim();

    if (!reference) {
      showMessage('Please enter your registration reference.', true);
      return;
    }

    lookupRegistration(reference);
  });

  async function lookupRegistration(reference) {
    result.hidden = true;
    showMessage('');
    
    if (!supabase) {
      showMessage('Supabase configuration is missing. Please contact the administrator.', true);
      return;
    }

    trackBtn.disabled = true;
    trackBtn.textContent = 'Checking…';

    try {
      const { data, error } = await supabase.functions.invoke(
        'track-sash',
        {
          body: { reference }
        }
      );

      if (error) {
        let errorMessage = error.message || 'Unable to retrieve registration.';

        if (error.context && typeof error.context.json === 'function') {
          try {
            const body = await error.context.json();
            errorMessage = body.error || body.message || errorMessage;
          } catch (_) {}
        }

        throw new Error(errorMessage);
      }

      if (!data || !data.success || !data.registration) {
        throw new Error(data?.error || 'Registration was not found.');
      }

      renderRegistration(data.registration);
      showMessage('');
      result.hidden = false;

    } catch (err) {
      console.error('Registration tracking error:', err);
      showMessage(err.message || 'Unable to track registration.', true);

    } finally {
      trackBtn.disabled = false;
      trackBtn.textContent = 'Track Registration';
    }
  }

  function renderRegistration(registration) {
    const fullName = [
      registration.first_name,
      registration.middle_name,
      registration.last_name
    ].filter(Boolean).join(' ');

    document.getElementById('appointeeName').textContent = fullName;
    document.getElementById('appointeePosition').textContent =
      registration.position || '';

    document.getElementById('resultReference').textContent =
      `Reference: ${registration.reference}`;

    document.getElementById('statusValue').textContent =
      statusLabel(registration.status);

    document.getElementById('statusDescription').textContent =
      statusDescription(registration.status);

    renderTimeline(registration.status);

    const adminNote = document.getElementById('adminNote');
    const adminNoteText = document.getElementById('adminNoteText');

    if (registration.admin_notes &&
        ['correction', 'rejected'].includes(registration.status)) {
      adminNoteText.textContent = registration.admin_notes;
      adminNote.hidden = false;
    } else {
      adminNote.hidden = true;
      adminNoteText.textContent = '';
    }
  }

  function statusLabel(status) {
    const labels = {
      pending: 'Pending Review',
      under_review: 'Under Review',
      approved: 'Approved',
      correction: 'Correction Required',
      rejected: 'Rejected',
      printed: 'Sash Printed'
    };

    return labels[status] || 'Status Update';
  }

  function statusDescription(status) {
    const descriptions = {
      pending: 'Your registration has been received and is awaiting administrator review.',
      under_review: 'An administrator is currently reviewing your registration and payment receipt.',
      approved: 'Your payment has been verified and your registration has been approved.',
      correction: 'Action is required. Please read the administrator’s message below.',
      rejected: 'Your registration has been rejected. Please read the administrator’s message below.',
      printed: 'Your sash has been marked as printed.'
    };

    return descriptions[status] || 'Your registration status has been updated.';
  }

  function renderTimeline(status) {
    const timeline = document.getElementById('trackTimeline');

    const stages = [
      {
        key: 'submitted',
        title: 'Registration Submitted',
        description: 'Your registration has been received.'
      },
      {
        key: 'review',
        title: 'Payment & Details Review',
        description: 'Your receipt and registration details are being checked.'
      },
      {
        key: 'approved',
        title: 'Registration Approved',
        description: 'Your registration has been approved.'
      },
      {
        key: 'printed',
        title: 'Sash Printing',
        description: 'Your sash is being prepared for printing or has been printed.'
      }
    ];

    const progressMap = {
      pending: 0,
      under_review: 1,
      correction: 1,
      rejected: 1,
      approved: 2,
      printed: 3
    };

    const currentIndex = progressMap[status] ?? 0;

    timeline.innerHTML = stages.map((stage, index) => {
      let className = 'timeline-item';

      if (index < currentIndex) className += ' complete';
      if (index === currentIndex) className += ' current';

      if (status === 'correction' && index === 1) {
        stage.title = 'Correction Required';
      }

      if (status === 'rejected' && index === 1) {
        stage.title = 'Registration Rejected';
      }

      return `
        <div class="${className}">
          <div class="timeline-marker"></div>
          <div>
            <div class="timeline-title">${escapeHTML(stage.title)}</div>
            <div class="timeline-description">${escapeHTML(stage.description)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.className = 'track-message';

    if (isError) {
      message.classList.add('error');
    }
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }
})();
