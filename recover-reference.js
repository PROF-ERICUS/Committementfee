const phoneForm = document.getElementById("phoneForm");
const phoneInput = document.getElementById("phone");
const messageBox = document.getElementById("message");

const recoverBtn = document.getElementById("recoverBtn");
const referenceResult = document.getElementById("referenceResult");

const supabaseClient = window.supabase.createClient(
  window.YPG_SUPABASE_URL,
  window.YPG_SUPABASE_ANON_KEY
);

// Normalize Ghanaian phone numbers
function normalizePhone(phone) {
  let value = phone.trim().replace(/[^\d+]/g, "");

  // Remove leading international dialing prefix 00
  if (value.startsWith("00")) {
    value = "+" + value.substring(2);
  }

  // Ghana local number: 0241234567 -> +233241234567
  if (/^0\d{9}$/.test(value)) {
    value = "+233" + value.substring(1);
  }

  // Ghana number without plus: 233241234567 -> +233241234567
  if (/^233\d{9}$/.test(value)) {
    value = "+" + value;
  }

  // Ensure international numbers have a plus
  if (/^\d{7,15}$/.test(value)) {
    value = "+" + value;
  }

  return value;
}

function showMessage(text, type = "error") {
  messageBox.textContent = text;
  messageBox.className = `recovery-message ${type}`;
}

// Get detailed Supabase error information
async function getDetailedError(error) {
  let details = error?.message || "Unknown error";

  // FunctionsHttpError may contain a Response object
  if (error?.context) {
    try {
      if (typeof error.context.json === "function") {
        const responseData = await error.context.json();
        details = JSON.stringify(responseData);
      } else if (typeof error.context.text === "function") {
        details = await error.context.text();
      }
    } catch {
      // Fall back to the standard error message
    }
  }

  return details;
}

phoneForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  messageBox.textContent = "";
  referenceResult.innerHTML = "";
  referenceResult.style.display = "none";

  const phone = normalizePhone(phoneInput.value);

  if (!phoneInput.value.trim()) {
    showMessage("Please enter your phone number.", "error");
    return;
  }

  if (!/^\+\d{7,15}$/.test(phone)) {
    showMessage(
      "Please enter a valid phone number.",
      "error"
    );
    return;
  }

  recoverBtn.disabled = true;
  recoverBtn.textContent = "Searching...";

  try {
    console.log("Reference recovery started");
    console.log("Normalized phone:", phone);

    const { data, error } = await supabaseClient.functions.invoke(
      "recover-sash-reference",
      {
        body: { phone },
      }
    );

    if (error) {
      console.error("Supabase function error:", error);

      const details = await getDetailedError(error);

      console.error("Detailed error:", details);

      throw new Error(details);
    }

    console.log("Recovery response:", data);

    if (!data || !data.success || !data.registrations?.length) {
      showMessage(
        data?.error || "No registration found for this phone number.",
        "error"
      );
      return;
    }

    // Display recovered registrations
    referenceResult.innerHTML = data.registrations.map((registration) => `
      <div class="recovered-registration">
        <h3>${escapeHTML(registration.name)}</h3>
        <p>${escapeHTML(registration.position)}</p>
        <p>${escapeHTML(registration.constituency)}</p>

        <div class="reference-box">
          Registration Reference
          <strong>${escapeHTML(registration.reference)}</strong>
        </div>

        <div class="recovery-actions">
          <button
            type="button"
            class="copy-btn"
            data-reference="${escapeHTML(registration.reference)}"
          >
            Copy Reference
          </button>

          <button
            type="button"
            class="track-btn"
            data-reference="${escapeHTML(registration.reference)}"
          >
            Track Registration
          </button>
        </div>
      </div>
    `).join("");

    referenceResult.style.display = "block";

    // Copy reference buttons
    referenceResult.querySelectorAll(".copy-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const reference = button.dataset.reference;

        try {
          await navigator.clipboard.writeText(reference);

          button.textContent = "Copied!";

          setTimeout(() => {
            button.textContent = "Copy Reference";
          }, 1800);

        } catch (error) {
          console.error("Copy error:", error);

          showMessage(
            "Could not copy. Please copy the reference manually.",
            "error"
          );
        }
      });
    });

    // Track registration buttons
    referenceResult.querySelectorAll(".track-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const reference = button.dataset.reference;

        window.location.href =
          "track.html?reference=" + encodeURIComponent(reference);
      });
    });

    showMessage("Registration reference found.", "success");

  } catch (error) {
    console.error("Reference recovery error:", error);
    console.error("Error message:", error.message);

    // TEMPORARY DEBUGGING MESSAGE
    showMessage(
      `Recovery failed: ${error.message}`,
      "error"
    );

  } finally {
    recoverBtn.disabled = false;
    recoverBtn.textContent = "Recover Reference";
  }
});

// HTML escaping
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