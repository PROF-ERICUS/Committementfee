
(() => {
  const form = document.getElementById('registrationForm');
  const receipt = document.getElementById('receipt');
  const fileName = document.getElementById('fileName');
  const message = document.getElementById('formMessage');
  const submit = document.getElementById('submitBtn');

  // Supabase configuration check
  const supabaseReady =
    window.YPG_SUPABASE_URL &&
    !window.YPG_SUPABASE_URL.includes('YOUR_PROJECT') &&
    window.YPG_SUPABASE_ANON_KEY &&
    !window.YPG_SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');

  const supabase = supabaseReady
    ? window.supabase.createClient(
        window.YPG_SUPABASE_URL,
        window.YPG_SUPABASE_ANON_KEY
      )
    : null;

  // Update selected receipt filename
  receipt.addEventListener('change', () => {
    fileName.textContent =
      receipt.files[0]?.name || 'Choose your receipt file';
  });

  // Registration form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    message.textContent = '';
    message.className = 'form-message';

    if (!supabase) {
      message.textContent =
        'Setup required: check your Supabase URL and publishable key in config.js.';
      message.classList.add('error');
      return;
    }

    const file = receipt.files[0];

    // Validate receipt
    if (!file) {
      message.textContent = 'Please select your payment receipt.';
      message.classList.add('error');
      return;
    }

    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      message.textContent = 'Receipt file must be between 1 byte and 5 MB.';
      message.classList.add('error');
      return;
    }

    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
      message.textContent = 'Only JPG, PNG or PDF receipts are accepted.';
      message.classList.add('error');
      return;
    }

    // Prepare registration data
    const formData = new FormData();

    formData.append('first_name', form.elements.first_name.value.trim());
    formData.append('middle_name', form.elements.middle_name.value.trim());
    formData.append('last_name', form.elements.last_name.value.trim());

    // NEW: Constituency field
    formData.append(
      'constituency',
      form.elements.constituency.value.trim()
    );

    formData.append('position', form.elements.position.value.trim());
    formData.append('receipt', file);

    // Loading state
    submit.disabled = true;
    submit.innerHTML = 'Submitting registration…';

    try {
      // Send to Supabase Edge Function
      const { data, error } = await supabase.functions.invoke(
        window.YPG_REGISTER_FUNCTION || 'register-sash',
        {
          body: formData
        }
      );

      // Handle Edge Function errors
      if (error) {
        let detailedError = error.message || 'Request failed';

        if (error.context) {
          try {
            const response = error.context;

            if (typeof response.json === 'function') {
              const responseBody = await response.json();

              detailedError =
                responseBody.error ||
                responseBody.message ||
                JSON.stringify(responseBody);
            }
          } catch (_) {
            // Use original error if response cannot be read
          }
        }

        console.error('Supabase registration error:', error);
        throw new Error(detailedError);
      }

      // Verify response
      if (!data || !data.success) {
        throw new Error(
          data?.error || 'Registration could not be submitted.'
        );
      }

      // Successful submission
      const reference = data.reference;

      // Reset form
      form.reset();
      fileName.textContent = 'Choose your receipt file';

      message.classList.add('success');

      if (reference) {
        const trackUrl =
          `track.html?reference=${encodeURIComponent(reference)}`;

        message.innerHTML = `
          <div class="registration-success">
            <h3>Registration Submitted Successfully!</h3>

            <p>
              Your registration has been received.
              Your payment is awaiting verification by an administrator.
            </p>

            <div class="reference-box">
              <strong>Your Registration Reference</strong>

              <div class="reference-number">
                ${escapeHTML(reference)}
              </div>

              <small>
                Please keep this reference number safe.
                You will need it to track your registration.
              </small>
            </div>

            <a class="track-link" href="${trackUrl}">
              Track My Registration →
            </a>
          </div>
        `;
      } else {
        message.textContent =
          'Registration submitted successfully! Your payment is pending verification.';
      }

    } catch (err) {
      console.error('Registration submission failed:', err);

      message.textContent =
        err.message || 'Submission failed. Please try again.';

      message.classList.add('error');

    } finally {
      // Restore button
      submit.disabled = false;
      submit.innerHTML = 'Submit Registration <span>→</span>';
    }
  });

  // Safely escape HTML to prevent injection
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
