
const phoneForm = document.getElementById("phoneForm");
const phoneInput = document.getElementById("phone");
const messageBox = document.getElementById("message");

const recoverBtn = document.getElementById("recoverBtn");
const referenceResult = document.getElementById("referenceResult");

// Old registration elements
const toggleOldRegistration = document.getElementById("toggleOldRegistration");
const oldRegistrationForm = document.getElementById("oldRegistrationForm");
const oldRegistrationMessage = document.getElementById("oldRegistrationMessage");
const oldRegistrationResult = document.getElementById("oldRegistrationResult");
const attachPhoneBtn = document.getElementById("attachPhoneBtn");

// Supabase
const supabaseClient = window.supabase.createClient(
  window.YPG_SUPABASE_URL,
  window.YPG_SUPABASE_ANON_KEY
);

// ==========================================
// GHANA PHONE NORMALIZATION
// ==========================================
function normalizePhone(phone) {
  let value = String(phone || "").trim().replace(/[^\d]/g, "");

  // Remove international prefix 00
  if (value.startsWith("00")) {
    value = value.substring(2);
  }

  // Local Ghana number: 0241234567
  if (/^0\d{9}$/.test(value)) {
    value = "233" + value.substring(1);
  }

  // Ghana international format: 233241234567
  if (/^233\d{9}$/.test(value)) {
    return "+" + value;
  }

  // Other international numbers
  if (/^\d{7,15}$/.test(value)) {
    return "+" + value;
  }

  return "";
}

// ==========================================
// HTML ESCAPING
// ==========================================
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

// ==========================================
// MESSAGE DISPLAY
// ==========================================
function showMessage(text, type = "error") {
  messageBox.textContent = text;
  messageBox.className = `recovery-message ${type}`;
}

function showOldRegistrationMessage(text, type = "error") {
  oldRegistrationMessage.textContent = text;
  oldRegistrationMessage.className = `old-registration-message ${type}`;
}

// ==========================================
// ERROR DETAILS
// ==========================================
async function getDetailedError(error) {
  let details = error?.message || "An unexpected error occurred.";

  if (error?.context) {
    try {
      if (typeof error.context.json === "function") {
        const responseData = await error.context.json();
        details =
          responseData?.error ||
          responseData?.message ||
          JSON.stringify(responseData);
      } else if (typeof error.context.text === "function") {
        details = await error.context.text();
      }
    } catch {
      // Keep original error message
    }
  }

  return details;
}

// ==========================================
// BUILD REGISTRATION DISPLAY
// ==========================================
function getRegistrationName(registration) {
  if (registration.name) {
    return registration.name;
  }

  return [
    registration.first_name,
    registration.middle_name,
    registration.last_name,
  ]
    .filter(Boolean)
    .join(" ");
}

// ==========================================
// DISPLAY REGISTRATIONS
// ==========================================
function displayRegistrations(registrations, targetElement) {
  if (!Array.isArray(registrations)) {
    registrations = registrations ? [registrations] : [];
  }

  if (!registrations.length) {
    targetElement.innerHTML = "";
    targetElement.style.display = "none";
    return;
  }

  targetElement.innerHTML = registrations
    .map((registration) => {
      const fullName = getRegistrationName(registration);

      return `
        <div class="recovered-registration">

          <h3>${escapeHTML(fullName)}</h3>

          <p>${escapeHTML(registration.position || "")}</p>

          <p>${escapeHTML(registration.constituency || "")}</p>

          <div class="reference-box">
            Registration Reference
            <strong>${escapeHTML(registration.reference || "")}</strong>
          </div>

          <div class="recovery-actions">

            <button
              type="button"
              class="copy-btn"
              data-reference="${escapeHTML(registration.reference || "")}"
            >
              Copy Reference
            </button>

            <button
              type="button"
              class="track-btn"
              data-reference="${escapeHTML(registration.reference || "")}"
            >
              Track Registration
            </button>

          </div>

        </div>
      `;
    })
    .join("");

  targetElement.style.display = "block";

  // ==========================================
  // COPY REFERENCE BUTTONS
  // ==========================================
  targetElement.querySelectorAll(".copy-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const reference = button.dataset.reference;

      try {
        await navigator.clipboard.writeText(reference);

        const originalText = button.textContent;
        button.textContent = "Copied!";

        setTimeout(() => {
          button.textContent = originalText;
        }, 1800);
      } catch (error) {
        console.error("Copy error:", error);

        button.textContent = "Copy manually";
      }
    });
  });

  // ==========================================
  // TRACK REGISTRATION BUTTONS
  // ==========================================
  targetElement.querySelectorAll(".track-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const reference = button.dataset.reference;

      window.location.href =
        "track.html?reference=" + encodeURIComponent(reference);
    });
  });
}

// ==========================================
// NORMAL PHONE REFERENCE RECOVERY
// ==========================================
phoneForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  messageBox.textContent = "";
  messageBox.className = "recovery-message";

  referenceResult.innerHTML = "";
  referenceResult.style.display = "none";

  const originalPhone = phoneInput.value.trim();

  if (!originalPhone) {
    showMessage("Please enter your phone number.", "error");
    return;
  }

  const phone = normalizePhone(originalPhone);

  if (!/^\+\d{7,15}$/.test(phone)) {
    showMessage("Please enter a valid phone number.", "error");
    return;
  }

  recoverBtn.disabled = true;
  recoverBtn.textContent = "Searching...";

  try {
    console.log("Phone recovery started");
    console.log("Normalized phone:", phone);

    const { data, error } =
      await supabaseClient.functions.invoke(
        "recover-sash-reference",
        {
          body: { phone },
        }
      );

    if (error) {
      console.error("Phone recovery error:", error);
      throw new Error(await getDetailedError(error));
    }

    console.log("Phone recovery response:", data);

    if (
      !data ||
      !data.success ||
      !Array.isArray(data.registrations) ||
      data.registrations.length === 0
    ) {
      showMessage(
        data?.error || "No registration found for this phone number.",
        "error"
      );
      return;
    }

    displayRegistrations(data.registrations, referenceResult);

    showMessage("Registration reference found successfully.", "success");

  } catch (error) {
    console.error("Phone recovery failed:", error);

    showMessage(
      `Recovery failed: ${error.message}`,
      "error"
    );

  } finally {
    recoverBtn.disabled = false;
    recoverBtn.textContent = "Recover Reference";
  }
});

// ==========================================
// TOGGLE OLD REGISTRATION FORM
// ==========================================
if (toggleOldRegistration && oldRegistrationForm) {
  toggleOldRegistration.addEventListener("click", () => {
    const isOpen = oldRegistrationForm.classList.contains("active");

    oldRegistrationForm.classList.toggle("active");

    if (isOpen) {
      toggleOldRegistration.textContent =
        "Add Phone to Existing Registration";
    } else {
      toggleOldRegistration.textContent =
        "Close Existing Registration Form";

      oldRegistrationForm.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  });
}

// ==========================================
// ADD PHONE TO AN EXISTING REGISTRATION
// ==========================================
oldRegistrationForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  oldRegistrationMessage.textContent = "";
  oldRegistrationMessage.className = "old-registration-message";

  oldRegistrationResult.innerHTML = "";
  oldRegistrationResult.style.display = "none";

  const firstName = document.getElementById("oldFirstName").value.trim();
  const middleName = document.getElementById("oldMiddleName").value.trim();
  const lastName = document.getElementById("oldLastName").value.trim();
  const constituency = document.getElementById("oldConstituency").value.trim();
  const position = document.getElementById("oldPosition").value.trim();
  const rawPhone = document.getElementById("newPhone").value.trim();

  // ==========================================
  // VALIDATION
  // ==========================================
  if (!firstName || !lastName || !constituency || !position || !rawPhone) {
    showOldRegistrationMessage(
      "Please complete all required fields.",
      "error"
    );
    return;
  }

  const newPhone = normalizePhone(rawPhone);

  if (!/^\+\d{7,15}$/.test(newPhone)) {
    showOldRegistrationMessage(
      "Please enter a valid phone number.",
      "error"
    );
    return;
  }

  attachPhoneBtn.disabled = true;
  attachPhoneBtn.textContent = "Finding Registration...";

  try {
    console.log("================================");
    console.log("Old registration phone attachment");
    console.log("Name:", firstName, middleName, lastName);
    console.log("Constituency:", constituency);
    console.log("Position:", position);
    console.log("Normalized phone:", newPhone);
    console.log("================================");

    // ==========================================
    // CALL EDGE FUNCTION
    // ==========================================
    const { data, error } =
      await supabaseClient.functions.invoke(
        "recover-old-sash-registration",
        {
          body: {
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            constituency: constituency,
            position: position,
            new_phone: newPhone,
          },
        }
      );

    if (error) {
      console.error("Attach phone function error:", error);

      const details = await getDetailedError(error);

      throw new Error(details);
    }

    console.log("Old registration response:", data);

    // ==========================================
    // CHECK RESPONSE
    // ==========================================
    if (!data || !data.success) {
      showOldRegistrationMessage(
        data?.error || "We could not locate your existing registration.",
        "error"
      );
      return;
    }

    // Accept either response format
    let registrations = [];

    if (Array.isArray(data.registrations)) {
      registrations = data.registrations;
    } else if (data.registration) {
      registrations = [data.registration];
    }

    // If the response only returns reference/name fields,
    // construct a display object from the submitted details.
    if (!registrations.length && data.reference) {
      registrations = [
        {
          reference: data.reference,
          name: data.name || [
            firstName,
            middleName,
            lastName,
          ]
            .filter(Boolean)
            .join(" "),
          constituency: data.constituency || constituency,
          position: data.position || position,
        },
      ];
    }

    if (!registrations.length) {
      showOldRegistrationMessage(
        "Your phone number may have been attached, but no reference was returned. Please try the Recover Reference section above.",
        "success"
      );
      return;
    }

    // ==========================================
    // SUCCESS
    // ==========================================
    displayRegistrations(
      registrations,
      oldRegistrationResult
    );

    showOldRegistrationMessage(
      "Your existing registration was found and your phone number has been attached successfully!",
      "success"
    );

    // Reset form after successful attachment
    oldRegistrationForm.reset();

  } catch (error) {
    console.error("Old registration recovery failed:", error);

    showOldRegistrationMessage(
      `Unable to attach phone number: ${error.message}`,
      "error"
    );

  } finally {
    attachPhoneBtn.disabled = false;
    attachPhoneBtn.textContent =
      "Find Registration & Add Phone";
  }
});

console.log("YPG Reference Recovery initialized successfully.");
