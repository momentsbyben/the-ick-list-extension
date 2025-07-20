// onboarding.js
// Depends on utils.js for loadSettings, saveSettings, showToast, DEFAULT_SETTINGS

document.addEventListener("DOMContentLoaded", async () => {
    // --- Element References ---
    const onboardingForm = document.getElementById("onboardingForm");
    const ageInput = document.getElementById("age");
    const genderSelect = document.getElementById("gender");
    const countrySelect = document.getElementById("country");
    const supportTypeInput = document.getElementById("supportType"); // Added
    const goalTextarea = document.getElementById("goal");           // Added

    // --- Functions ---

    /**
     * Loads existing onboarding profile data and pre-fills the form.
     */
    async function loadAndPrepopulateForm() {
        try {
            const settings = await loadSettings();
            const profile = settings.onboardingProfile;

            // If onboarding is already complete, maybe redirect or just show data
            if (settings.onboardingComplete) {
                showToast("Onboarding already completed!", "info");
                // Optional: Disable form or show a "Go to settings" button
                onboardingForm.querySelector('button[type="submit"]').textContent = "Update Profile";
            }

            // Pre-fill fields if data exists
            if (profile) {
                if (profile.age) ageInput.value = profile.age;
                if (profile.gender) genderSelect.value = profile.gender;
                if (profile.country) countrySelect.value = profile.country;
                if (profile.supportType) supportTypeInput.value = profile.supportType; // Added
                if (profile.goal) goalTextarea.value = profile.goal;                 // Added
            }
        } catch (error) {
            console.error("Error loading onboarding profile:", error);
            showToast("Failed to load profile data.", "error");
        }
    }

    /**
     * Handles the form submission for onboarding.
     */
    async function handleOnboardingSubmit(event) {
        event.preventDefault(); // Prevent default form submission

        const newProfile = {
            age: parseInt(ageInput.value),
            gender: genderSelect.value,
            country: countrySelect.value,
            supportType: supportTypeInput.value.trim(), // Added
            goal: goalTextarea.value.trim()             // Added
        };

        try {
            // Merge with existing profile, or set new
            await saveSettings({
                onboardingProfile: { ...DEFAULT_SETTINGS.onboardingProfile, ...newProfile },
                onboardingComplete: true // Mark onboarding as complete
            });
            showToast("Profile saved! Welcome to The Ick List!", "success");

            // Redirect to a main page, e.g., popup.html or options.html
            // Or guide them to the check-in or support page
            if (typeof goTo === 'function') {
                setTimeout(() => goTo("popup.html"), 1500); // Redirect after toast
            } else {
                setTimeout(() => window.close(), 1500); // Close popup
            }

        } catch (error) {
            console.error("Error saving onboarding data:", error);
            showToast("Failed to save profile. Please try again.", "error");
        }
    }

    // --- Event Listeners ---
    onboardingForm.addEventListener("submit", handleOnboardingSubmit);

    // Initial load
    loadAndPrepopulateForm();
});