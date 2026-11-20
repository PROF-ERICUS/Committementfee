
(() => {
  const form = document.getElementById('trackForm');
  const referenceInput = document.getElementById('reference');
  const trackBtn = document.getElementById('trackBtn');
  const message = document.getElementById('trackMessage');
  const result = document.getElementById('trackResult');

  const supabaseReady =
    window.YPG_SUPABASE_URL &&
    window.YPG_SUPABASE_ANON_KEY &&
    window.supabase;

  const supabase = supabaseReady
    ? window.supabase.createClient(
        window.YPG_SUPABASE_URL,
        window.YPG_SUPABASE_ANON_KEY
      )
    : null;

  const params = new URLSearchParams(window.location.search);
  const urlReference = params.get('reference');

  // Constituency display
  const positionElement = document.getElementById('appointeePosition');
  let constituencyElement = document.getElementById('appointeeConstituency');

  if (positionElement && !constituencyElement) {
    constituencyElement = document.createElement('p');
    constituencyElement.id = 'appointeeConstituency';
    constituencyElement.className = 'appointee-constituency';
    positionElement.insertAdjacentElement('afterend', constituencyElement);
  }

  // Correction button helpers
  function hideCorrectionButton() {
    if (typeof window.YPG_HIDE_CORRECTION === 'function') {
      window.YPG_HIDE_CORRECTION();
    }
  }

  function showCorrectionButton(reference) {
    if (typeof window.YPG_SHOW_CORRECTION === 'function') {
      window.YPG_SHOW_CORRECTION(reference);
    }
  }

  hideCorrectionButton();

  // Auto-track when reference is supplied in the URL
  if (urlReference) {
    referenceInput.value = urlReference.trim().toUpperCase();
    lookupRegistration(urlReference);
  }

  // Manual tracking form
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const reference = referenceInput.value.trim().toUpperCase();

    if (!reference) {
      hideCorrectionButton();
      showMessage('Please enter your registration reference.', true);
      return;
    }

    lookupRegistration(reference);
  });

  // Fetch registration
  async function lookupRegistration(reference) {
    result.hidden = true;
    hideCorrectionButton();
    showMessage('');

    if (!supabase) {
      showMessage(
        'Supabase configuration is missing. Please contact the administrator.',
        true
      );
      return;
    }

    reference = String(reference || '').trim().toUpperCase();

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
            errorMessage =
              body.error ||
              body.message ||
            errorMessage;
          } catch (_) {}
        }

        throw new Error(errorMessage);
      }

      if (!data || !data.success || !data.registration) {
        throw new Error(
          data?.error ||
          'Registration was not found. Please check your reference.'
        );
      }

      renderRegistration(data.registration);

      showMessage('');
      result.hidden = false;

    } catch (err) {
      console.error('Registration tracking error:', err);

      hideCorrectionButton();

      showMessage(
        err.message ||
        'Unable to track registration. Please try again.',
        true
      );

    } finally {
      trackBtn.disabled = false;
      trackBtn.textContent = 'Track Registration';
    }
  }

  // Render registration details
  function renderRegistration(registration) {
    const fullName = [
      registration.first_name,
      registration.middle_name,
      registration.last_name
    ].filter(Boolean).join(' ');

    // Name
    const nameElement = document.getElementById('appointeeName');
    if (nameElement) {
      nameElement.textContent =
        fullName || 'Registered Appointee';
    }

    // Position
    const positionElement = document.getElementById('appointeePosition');
    if (positionElement) {
      positionElement.textContent =
        registration.position || 'Position not specified';
    }

    // Constituency
    if (constituencyElement) {
      constituencyElement.textContent = registration.constituency
        ? `Constituency: ${registration.constituency}`
        : '';

      constituencyElement.hidden = !registration.constituency;
    }

    // Registration reference
    const reference = registration.reference || 'N/A';

    const resultReference = document.getElementById('resultReference');
    if (resultReference) {
      resultReference.textContent = `Reference: ${reference}`;
    }

    // Large reference display
    const referenceNumberDisplay =
      document.getElementById('referenceNumberDisplay');

    if (referenceNumberDisplay) {
      referenceNumberDisplay.textContent = reference;
    }

    // Status
    const statusValue = document.getElementById('statusValue');
    if (statusValue) {
      statusValue.textContent = statusLabel(registration.status);
    }

    // Status description
    const statusDescriptionElement =
      document.getElementById('statusDescription');

    if (statusDescriptionElement) {
      statusDescriptionElement.textContent =
        statusDescription(registration.status);
    }

    // Timeline
    renderTimeline(registration.status);

    // Admin Notes
    const adminNote = document.getElementById('adminNote');
    const adminNoteText = document.getElementById('adminNoteText');

    if (
      adminNote &&
      adminNoteText &&
      registration.admin_notes &&
      ['correction', 'rejected'].includes(registration.status)
    ) {
      adminNoteText.textContent = registration.admin_notes;
      adminNote.hidden = false;
    } else if (adminNote && adminNoteText) {
      adminNote.hidden = true;
      adminNoteText.textContent = '';
    }

    // Correction action - only when correction is required
    if (registration.status === 'correction') {
      showCorrectionButton(registration.reference);
    } else {
      hideCorrectionButton();
    }
  }

  // Status labels
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

  // Status descriptions
  function statusDescription(status) {
    const descriptions = {
      pending:
        'Your registration has been received and is awaiting administrator review.',

      under_review:
        'An administrator is currently reviewing your registration and payment receipt.',

      approved:
        'Your payment has been verified and your registration has been approved.',

      correction:
        'Action is required. Please read the administrator’s message below.',

      rejected:
        'Your registration has been rejected. Please read the administrator’s message below.',

      printed:
        'Your sash has been marked as printed.'
    };

    return descriptions[status] ||
      'Your registration status has been updated.';
  }

  // Timeline
  function renderTimeline(status) {
    const timeline = document.getElementById('trackTimeline');

    if (!timeline) return;

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
      let title = stage.title;
      let description = stage.description;

      if (index < currentIndex) {
        className += ' complete';
      }

      if (index === currentIndex) {
        className += ' current';
      }

      if (status === 'correction' && index === 1) {
        title = 'Correction Required';
        description =
          'Please follow the administrator’s instructions to correct your registration.';
      }

      if (status === 'rejected' && index === 1) {
        title = 'Registration Rejected';
        description =
          'Your registration has been rejected. Check the administrator’s message.';
      }

      return `
        <div class="${className}">
          <div class="timeline-marker"></div>
          <div>
            <div class="timeline-title">${escapeHTML(title)}</div>
            <div class="timeline-description">${escapeHTML(description)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Message display
  function showMessage(text, isError = false) {
    if (!message) return;

    message.textContent = text;
    message.className = 'track-message';

    if (isError) {
      message.classList.add('error');
    }
  }

  // HTML escaping
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
