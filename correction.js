(() => {
  const lookupForm = document.getElementById('correctionLookupForm');
  const referenceInput = document.getElementById('correctionReference');
  const lookupBtn = document.getElementById('lookupCorrectionBtn');
  const lookupMessage = document.getElementById('lookupMessage');

  const correctionPanel = document.getElementById('correctionPanel');
  const correctionForm = document.getElementById('correctionForm');
  const displayReference = document.getElementById('displayReference');
  const registrationId = document.getElementById('registrationId');
  const adminCorrectionMessage = document.getElementById('adminCorrectionMessage');

  const submitBtn = document.getElementById('submitCorrectionBtn');
  const correctionMessage = document.getElementById('correctionMessage');
  const confirmation = document.getElementById('correctionConfirmation');

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

  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  const ALLOWED_FILE_TYPES = [
    'image/jpeg',
    'image/png',
    'application/pdf'
  ];

  // --------------------------------------------------
  // FIELD CONFIGURATION
  // --------------------------------------------------

  const fieldConfig = {
    first_name: {
      wrapper: 'firstNameField',
      input: 'firstName',
      status: 'firstNameStatus',
      label: 'First Name'
    },

    middle_name: {
      wrapper: 'middleNameField',
      input: 'middleName',
      status: 'middleNameStatus',
      label: 'Middle Name'
    },

    last_name: {
      wrapper: 'lastNameField',
      input: 'lastName',
      status: 'lastNameStatus',
      label: 'Last Name'
    },

    constituency: {
      wrapper: 'constituencyField',
      input: 'constituency',
      status: 'constituencyStatus',
      label: 'Constituency'
    },

    position: {
      wrapper: 'positionField',
      input: 'position',
      status: 'positionStatus',
      label: 'Position / Appointment'
    },

    // NEW: PHONE NUMBER
    phone: {
      wrapper: 'phoneField',
      input: 'phone',
      status: 'phoneStatus',
      label: 'Phone Number'
    },

    receipt: {
      wrapper: 'receiptField',
      input: 'replacementReceipt',
      status: 'receiptStatus',
      label: 'Payment Receipt'
    }
  };

  let currentRegistration = null;
  let allowedCorrectionFields = [];

  // --------------------------------------------------
  // INITIALIZE
  // --------------------------------------------------

  correctionPanel.hidden = true;
  correctionForm.classList.remove('active');

  // Automatically load reference from URL
  const params = new URLSearchParams(window.location.search);
  const urlReference = params.get('reference');

  if (urlReference) {
    referenceInput.value = urlReference.trim().toUpperCase();
    loadRegistration(urlReference);
  }

  // --------------------------------------------------
  // LOOKUP
  // --------------------------------------------------

  lookupForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const reference = referenceInput.value.trim().toUpperCase();

    if (!reference) {
      showLookupMessage(
        'Please enter your registration reference.',
        true
      );
      return;
    }

    await loadRegistration(reference);
  });

  async function loadRegistration(reference) {
    resetPage();

    if (!supabase) {
      showLookupMessage(
        'System configuration is missing. Please contact the administrator.',
        true
      );
      return;
    }

    reference = String(reference || '').trim().toUpperCase();

    lookupBtn.disabled = true;
    lookupBtn.textContent = 'Loading Registration…';

    try {
      const { data, error } = await supabase.functions.invoke(
        'track-sash',
        {
          body: { reference }
        }
      );

      if (error) {
        throw await getFunctionError(error);
      }

      if (!data || !data.success || !data.registration) {
        throw new Error(
          data?.error ||
          'Registration not found. Please verify your reference.'
        );
      }

      const registration = data.registration;

      // Only registrations sent back for correction can be edited
      if (registration.status !== 'correction') {
        throw new Error(
          `Your registration is currently "${formatStatus(registration.status)}". Corrections are only available when an administrator requests them.`
        );
      }

      currentRegistration = registration;

      allowedCorrectionFields = Array.isArray(
        registration.correction_fields
      )
        ? registration.correction_fields
        : [];

      if (allowedCorrectionFields.length === 0) {
        throw new Error(
          'The administrator has not specified which fields need correction. Please contact the administrator.'
        );
      }

      populateRegistration(registration);
      configureCorrectionFields(allowedCorrectionFields);

      displayReference.textContent =
        registration.reference || reference;

      adminCorrectionMessage.textContent =
        registration.admin_notes ||
        'Please correct the requested information.';

      correctionPanel.hidden = false;
      correctionForm.classList.add('active');

      showLookupMessage('');

    } catch (error) {
      console.error('Correction lookup error:', error);

      showLookupMessage(
        error.message ||
        'Unable to load registration. Please try again.',
        true
      );

    } finally {
      lookupBtn.disabled = false;
      lookupBtn.textContent = 'Load Registration';
    }
  }

  // --------------------------------------------------
  // POPULATE EXISTING DATA
  // --------------------------------------------------

  function populateRegistration(registration) {
    document.getElementById('firstName').value =
      registration.first_name || '';

    document.getElementById('middleName').value =
      registration.middle_name || '';

    document.getElementById('lastName').value =
      registration.last_name || '';

    document.getElementById('constituency').value =
      registration.constituency || '';

    document.getElementById('position').value =
      registration.position || '';

    // NEW: Populate existing phone number
    const phoneInput = document.getElementById('phone');

    if (phoneInput) {
      phoneInput.value = registration.phone || '';
    }

    registrationId.value = registration.id || '';
  }

  // --------------------------------------------------
  // FIELD PERMISSIONS
  // --------------------------------------------------

  function configureCorrectionFields(fields) {
    Object.entries(fieldConfig).forEach(([key, config]) => {
      const wrapper = document.getElementById(config.wrapper);
      const input = document.getElementById(config.input);
      const status = document.getElementById(config.status);

      if (!wrapper || !input || !status) return;

      const isAllowed = fields.includes(key);

      // Show only fields requested by the admin
      wrapper.hidden = !isAllowed;

      // Enable/disable the field
      input.disabled = !isAllowed;

      if (isAllowed) {
        status.textContent =
          'This field has been requested for correction.';

        status.className =
          'field-status editable-note';

      } else {
        status.textContent = '';

        status.className =
          'field-status locked-note';
      }
    });
  }

  // --------------------------------------------------
  // PHONE VALIDATION
  // --------------------------------------------------

  function validatePhoneNumber(phone) {
    const cleaned = String(phone || '').trim();

    // Remove spaces, hyphens and brackets for validation
    const digits = cleaned.replace(/\D/g, '');

    // Ghana local format: 0241234567
    const ghLocal =
      digits.length === 10 && digits.startsWith('0');

    // Ghana international format: 233241234567
    const ghInternational =
      digits.length === 12 && digits.startsWith('233');

    // General international phone format
    const international =
      digits.length >= 7 && digits.length <= 15;

    if (ghLocal || ghInternational || international) {
      return {
        valid: true,
        cleaned
      };
    }

    return {
      valid: false,
      cleaned
    };
  }

  // --------------------------------------------------
  // SUBMIT CORRECTIONS
  // --------------------------------------------------

  correctionForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    clearCorrectionMessage();

    if (!supabase) {
      showCorrectionMessage(
        'System configuration is missing. Please contact the administrator.',
        true
      );
      return;
    }

    if (!currentRegistration) {
      showCorrectionMessage(
        'Please load your registration before submitting corrections.',
        true
      );
      return;
    }

    if (currentRegistration.status !== 'correction') {
      showCorrectionMessage(
        'This registration is no longer open for correction.',
        true
      );
      return;
    }

    if (!confirmation.checked) {
      showCorrectionMessage(
        'Please confirm that your corrections are accurate before submitting.',
        true
      );
      return;
    }

    // --------------------------------------------------
    // PREPARE PAYLOAD
    // --------------------------------------------------

    const formData = new FormData();

    formData.append(
      'reference',
      currentRegistration.reference
    );

    // Send ONLY fields authorized for correction
    const fieldMap = {
      first_name: 'firstName',
      middle_name: 'middleName',
      last_name: 'lastName',
      constituency: 'constituency',
      position: 'position',
      phone: 'phone'
    };

    // --------------------------------------------------
    // PROCESS AUTHORIZED TEXT FIELDS
    // --------------------------------------------------

    for (const field of allowedCorrectionFields) {
      if (!fieldMap[field]) continue;

      const input = document.getElementById(
        fieldMap[field]
      );

      if (!input) continue;

      const value = input.value.trim();

      // Middle name is optional
      if (!value && field !== 'middle_name') {
        showCorrectionMessage(
          `${fieldConfig[field].label} cannot be empty.`,
          true
        );

        input.focus();
        return;
      }

      // ------------------------------------------------
      // PHONE NUMBER VALIDATION
      // ------------------------------------------------

      if (field === 'phone') {
        const phoneValidation = validatePhoneNumber(value);

        if (!phoneValidation.valid) {
          showCorrectionMessage(
            'Please enter a valid phone number. Example: 0241234567 or +233241234567.',
            true
          );

          input.focus();
          return;
        }

        // Send the phone number in the entered format
        formData.append('phone', phoneValidation.cleaned);
        continue;
      }

      formData.append(field, value);
    }

    // --------------------------------------------------
    // VALIDATE REPLACEMENT RECEIPT IF REQUESTED
    // --------------------------------------------------

    if (allowedCorrectionFields.includes('receipt')) {
      const receiptInput = document.getElementById(
        'replacementReceipt'
      );

      const file = receiptInput.files[0];

      if (!file) {
        showCorrectionMessage(
          'Please upload your replacement payment receipt.',
          true
        );

        receiptInput.focus();
        return;
      }

      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        showCorrectionMessage(
          'Invalid receipt format. Upload JPG, PNG or PDF only.',
          true
        );
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        showCorrectionMessage(
          'The receipt exceeds 5 MB. Please upload a smaller file.',
          true
        );
        return;
      }

      formData.append('receipt', file);
    }

    // --------------------------------------------------
    // SUBMIT
    // --------------------------------------------------

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Correction…';

    try {
      const { data, error } = await supabase.functions.invoke(
        'submit-correction',
        {
          body: formData
        }
      );

      if (error) {
        throw await getFunctionError(error);
      }

      if (!data || !data.success) {
        throw new Error(
          data?.error ||
          'Your correction could not be submitted.'
        );
      }

      showCorrectionMessage(
        'Your correction has been submitted successfully. Your registration has returned to Pending Review.',
        false
      );

      submitBtn.textContent = 'Correction Submitted';

      correctionForm
        .querySelectorAll('input, button')
        .forEach((element) => {
          element.disabled = true;
        });

      // Clear query reference after success
      const url = new URL(window.location.href);

      url.searchParams.delete('reference');

      window.history.replaceState({}, '', url);

    } catch (error) {
      console.error('Correction submission error:', error);

      showCorrectionMessage(
        error.message ||
        'An error occurred while submitting your correction.',
        true
      );

      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Correction';
    }
  });

  // --------------------------------------------------
  // RECEIPT FILE VALIDATION
  // --------------------------------------------------

  const receiptInput = document.getElementById(
    'replacementReceipt'
  );

  receiptInput.addEventListener('change', () => {
    clearCorrectionMessage();

    const file = receiptInput.files[0];

    if (!file) return;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      receiptInput.value = '';

      showCorrectionMessage(
        'Invalid file type. Please select a JPG, PNG or PDF receipt.',
        true
      );

      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      receiptInput.value = '';

      showCorrectionMessage(
        'File is too large. The maximum allowed size is 5 MB.',
        true
      );

      return;
    }

    showCorrectionMessage(
      `Receipt selected: ${file.name}`,
      false
    );
  });

  // --------------------------------------------------
  // RESET
  // --------------------------------------------------

  function resetPage() {
    correctionPanel.hidden = true;
    correctionForm.classList.remove('active');

    currentRegistration = null;
    allowedCorrectionFields = [];

    correctionForm.reset();

    Object.values(fieldConfig).forEach((config) => {
      const wrapper = document.getElementById(config.wrapper);
      const input = document.getElementById(config.input);
      const status = document.getElementById(config.status);

      if (!wrapper || !input || !status) return;

      wrapper.hidden = true;
      input.disabled = false;

      status.textContent = '';
      status.className = 'field-status';
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Correction';

    clearCorrectionMessage();
    showLookupMessage('');
  }

  // --------------------------------------------------
  // MESSAGES
  // --------------------------------------------------

  function showLookupMessage(text, isError = false) {
    lookupMessage.textContent = text;
    lookupMessage.style.color =
      isError ? '#b42323' : '#666';
  }

  function showCorrectionMessage(text, isError = false) {
    correctionMessage.textContent = text;
    correctionMessage.className = 'correction-message';

    if (isError) {
      correctionMessage.classList.add('error');
    } else {
      correctionMessage.classList.add('success');
    }
  }

  function clearCorrectionMessage() {
    correctionMessage.textContent = '';
    correctionMessage.className = 'correction-message';
  }

  // --------------------------------------------------
  // ERROR HANDLING
  // --------------------------------------------------

  async function getFunctionError(error) {
    let errorMessage =
      error?.message || 'Request failed.';

    if (
      error?.context &&
      typeof error.context.json === 'function'
    ) {
      try {
        const body = await error.context.json();

        errorMessage =
          body?.error ||
          body?.message ||
          errorMessage;

      } catch (_) {}
    }

    return new Error(errorMessage);
  }

  // --------------------------------------------------
  // STATUS FORMATTING
  // --------------------------------------------------

  function formatStatus(status) {
    const labels = {
      pending: 'Pending Review',
      under_review: 'Under Review',
      approved: 'Approved',
      correction: 'Correction Required',
      rejected: 'Rejected',
      printed: 'Printed'
    };

    return labels[status] || status || 'Unknown';
  }

})();
