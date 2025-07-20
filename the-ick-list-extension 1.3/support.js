// support.js
// Depends on utils.js for loadSettings, saveSettings, showToast, DEFAULT_SETTINGS
// Depends on nav.js for goTo

document.addEventListener("DOMContentLoaded", async () => {
    // --- Element References ---
    const supportList = document.getElementById("supportList");

    // --- Navigation Button References ---
    const backNavBtn = document.getElementById("backNavBtn");
    const checkinNavBtn = document.getElementById("checkinNavBtn");

    // --- Functions ---

    /**
     * Loads user profile settings and displays tailored support resources.
     */
    async function loadAndDisplaySupport() {
        try {
            const settings = await loadSettings();
            const onboardingProfile = settings.onboardingProfile;
            const safeModeEnabled = settings.safeMode;
            const calmModeEnabled = settings.calmMode;

            updateModeDependentUI(safeModeEnabled, calmModeEnabled);

            // Clear previous content
            supportList.innerHTML = "";

            // Example of dynamic content based on profile (you'll expand this)
            let contentHtml = "";

            contentHtml += "<h3>General Resources:</h3><ul>";
            contentHtml += `<li><a href="https://www.mind.org.uk/information-support/guides-to-support-and-services/crisis-services/useful-contacts/" target="_blank">Mind UK - Crisis Contacts</a></li>`;
            contentHtml += `<li><a href="https://www.samaritans.org/" target="_blank">Samaritans (UK)</a></li>`;
            contentHtml += `<li><a href="https://www.nami.org/help" target="_blank">NAMI (US) - Find Support</a></li>`;
            contentHtml += `<li><a href="https://www.crisistextline.org/" target="_blank">Crisis Text Line (US/CA)</a></li>`;
            contentHtml += `</ul>`;

            // Add profile-specific suggestions if available
            if (onboardingProfile) {
                if (onboardingProfile.supportType && onboardingProfile.supportType.trim() !== '') {
                    contentHtml += `<h3>Support for "${onboardingProfile.supportType}"</h3>`;
                    contentHtml += `<p>Explore resources related to your chosen support type, "${onboardingProfile.supportType}".</p>`;
                    // Add more specific links here based on supportType, e.g.,
                    // if (onboardingProfile.supportType.toLowerCase().includes("anxiety")) { ... }
                }
                if (onboardingProfile.goal && onboardingProfile.goal.trim() !== '') {
                    contentHtml += `<h3>Your Goal: "${onboardingProfile.goal}"</h3>`;
                    contentHtml += `<p>Keep your goal in mind as you navigate online spaces.</p>`;
                }
                if (onboardingProfile.age || onboardingProfile.gender || onboardingProfile.country) {
                    contentHtml += `<h3>Based on Your Demographics:</h3>`;
                    if (onboardingProfile.age) contentHtml += `<p>Age: ${onboardingProfile.age}</p>`;
                    if (onboardingProfile.gender) contentHtml += `<p>Gender: ${onboardingProfile.gender}</p>`;
                    if (onboardingProfile.country) contentHtml += `<p>Country: ${onboardingProfile.country}</p>`;
                    contentHtml += `<p>Look for local support organizations in your area.</p>`;
                }
            } else {
                contentHtml += `<p>Complete your onboarding to get personalized support suggestions!</p>`;
                contentHtml += `<button class="primary" onclick="goTo('onboarding.html')">Go to Onboarding</button>`;
            }

            contentHtml += `
                <h3>Additional Tips:</h3>
                <ul>
                    <li>Practice deep breathing exercises.</li>
                    <li>Connect with a trusted friend or family member.</li>
                    <li>Engage in a calming activity (e.g., reading, listening to music).</li>
                </ul>
            `;

            supportList.innerHTML = contentHtml;
            showToast("Support resources loaded.", "success");

        } catch (error) {
            console.error("Error loading support resources:", error);
            supportList.innerHTML = "<p class='error-message'>Failed to load support resources. Please try again later.</p>";
            showToast("Failed to load support.", "error");
        }
    }

    /**
     * Updates UI elements that depend on Safe Mode and Calm Mode states.
     * @param {boolean} safeModeEnabled
     * @param {boolean} calmModeEnabled
     */
    function updateModeDependentUI(safeModeEnabled, calmModeEnabled) {
        // Apply body classes for styling
        document.body.classList.toggle("safe-mode", safeModeEnabled);
        document.body.classList.toggle("calm-mode", calmModeEnabled && !safeModeEnabled);
    }


    // --- Event Listeners ---

    // Navigation buttons (using nav.js)
    if (backNavBtn && typeof goTo === 'function') {
        // Decide where 'Back' should go. Assuming options.html or popup.html is a sensible default.
        // If coming from onboarding, it might go back to onboarding. But without state, options is safer.
        backNavBtn.addEventListener("click", () => goTo("options.html"));
    }
    if (checkinNavBtn && typeof goTo === 'function') {
        checkinNavBtn.addEventListener("click", () => goTo("checkin.html"));
    }

    // Initial load when the support page is opened
    loadAndDisplaySupport();
    highlightActiveNav(); // From nav.js
});