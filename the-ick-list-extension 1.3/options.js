// options.js
// Depends on utils.js for loadSettings, saveSettings, showToast, DEFAULT_SETTINGS
// Depends on nav.js for goTo

document.addEventListener("DOMContentLoaded", async () => {
    // --- Element References ---
    // IMPORTANT: Ensure these IDs match your options.html
    const ickWordsTextarea = document.getElementById("ickWordsTextarea"); // This should be your main textarea for words
    const saveIckListBtn = document.getElementById("saveIckListBtn");    // This should be your "Save Ick List" button
    
    // Your existing elements for sidebar chips and suggestions
    const ickWordsDisplayContainer = document.getElementById("ickWordsDisplayContainer"); // Container for word chips (sidebar)
    const suggestedWordsContainer = document.getElementById("suggestedWordsContainer");
    const addAllSuggestedBtn = document.getElementById("addAllSuggestedBtn");
    
    // Toggle switches
    const safeModeToggle = document.getElementById("safeModeToggle");
    const calmModeToggle = document.getElementById("calmModeToggle");
    
    // Reset functionality
    const resetSettingsBtn = document.getElementById("resetSettingsBtn");
    const confirmResetModal = document.getElementById("confirmResetModal");
    const confirmResetBtn = document.getElementById("confirmReset");
    const cancelResetBtn = document.getElementById("cancelReset");

    // --- Navigation Button References ---
    const popupNavBtn = document.getElementById("popupNavBtn");
    const statsNavBtn = document.getElementById("statsNavBtn");
    const onboardingNavBtn = document.getElementById("onboardingNavBtn");
    const supportNavBtn = document.getElementById("supportNavBtn");
    const checkinNavBtn = document.getElementById("checkinNavBtn");

    // --- State Variables ---
    let currentIckWords = [];
    const suggestedWords = ["trigger", "anxiety", "stress", "panic", "trauma", "flashback", "overwhelmed"]; // Example suggestions

    // --- Functions ---

    /**
     * Loads settings and updates the UI elements on the options page.
     */
    async function loadAndRenderSettings() {
        try {
            const settings = await loadSettings(); // From utils.js
            currentIckWords = settings.ickWords || [];
            
            console.log("Options: Current ick words loaded:", currentIckWords); // ADDED console.log
            
            // Populate the main textarea with current ick words, each on a new line
            ickWordsTextarea.value = currentIckWords.join("\n");

            renderIckWords(); // Render the ick words as chips (sidebar)
            safeModeToggle.checked = settings.safeMode;
            calmModeToggle.checked = settings.calmMode;

            renderSuggestedWords(); // Render suggested words (will now mark already added ones)
            updateModeDependentUI(settings.safeMode, settings.calmMode);
            console.log("Options settings loaded and rendered.");
        } catch (error) {
            console.error("Error loading settings in options:", error);
            showToast("Failed to load settings.", "error"); // From utils.js
        }
    }

    /**
     * Renders the currentIckWords array as clickable chips in the display container (sidebar).
     */
    function renderIckWords() {
        console.log("Options: Attempting to render ick words. Container element:", ickWordsDisplayContainer); // ADDED console.log
        console.log("Options: Words to render:", currentIckWords); // ADDED console.log

        if (!ickWordsDisplayContainer) { // Added a check to prevent errors if element is null
            console.error("ickWordsDisplayContainer element not found. Cannot render ick words.");
            return;
        }

        ickWordsDisplayContainer.innerHTML = ""; // Clear existing chips
        if (currentIckWords.length === 0) {
            const message = document.createElement("span");
            message.className = "no-words-message";
            message.textContent = "No words added yet. Add some above or from suggestions!";
            ickWordsDisplayContainer.appendChild(message);
            return;
        }

        currentIckWords.forEach(word => {
            const chip = document.createElement("div");
            chip.className = "word-chip";
            chip.innerHTML = `
                <span>${word}</span>
                <button class="delete-btn" aria-label="Remove word ${word}">&times;</button>
            `;
            chip.querySelector(".delete-btn").addEventListener("click", () => removeIckWord(word));
            ickWordsDisplayContainer.appendChild(chip);
        });
    }

    /**
     * Reads words from the main textarea, updates currentIckWords, and saves.
     * This function replaces addIckWordFromInput for the main word list.
     */
    async function saveIckListFromTextarea() {
        // Get words from textarea, split by new line, filter empty lines, trim, and make lowercase
        let wordsFromTextarea = ickWordsTextarea.value
            .split("\n")
            .map(word => word.trim().toLowerCase())
            .filter(word => word !== "");

        // Update currentIckWords with new list from textarea
        currentIckWords = wordsFromTextarea;
        await saveIckWords(); // This will handle uniqueness and sorting
        showToast("Ick List updated from textarea!", "success");
    }

    /**
     * Removes a specified word from the ick words list.
     * This function is primarily for the sidebar chips but also updates the main textarea.
     * @param {string} wordToRemove - The word to remove.
     */
    async function removeIckWord(wordToRemove) {
        currentIckWords = currentIckWords.filter(word => word !== wordToRemove);
        ickWordsTextarea.value = currentIckWords.join("\n"); // Update the main textarea
        await saveIckWords();
        showToast(`'${wordToRemove}' removed from your list.`, "info");
    }

    /**
     * Renders suggested words as clickable chips.
     */
    function renderSuggestedWords() {
        suggestedWordsContainer.innerHTML = "";
        if (suggestedWords.length === 0) {
            suggestedWordsContainer.innerHTML = "<p>No suggested words available.</p>";
            return;
        }

        suggestedWords.forEach(word => {
            const span = document.createElement("span");
            span.className = "word-chip";
            span.textContent = word;
            span.title = `Click to add "${word}" to your list`;
            
            // Add a class for styling if the word is already in the user's list
            if (currentIckWords.includes(word)) {
                span.classList.add('added-suggestion'); // Add this class to `options_popup.css` for styling
                span.style.cursor = "default"; // Make it look non-clickable
            } else {
                span.addEventListener("click", () => addSuggestedWord(word));
            }
            suggestedWordsContainer.appendChild(span);
        });
    }

    /**
     * Adds a single suggested word to the currentIckWords list and saves.
     * This also updates the main textarea.
     * @param {string} wordToAdd - The suggested word to add.
     */
    async function addSuggestedWord(wordToAdd) {
        // Ensure the word is not already in the current list
        if (!currentIckWords.includes(wordToAdd)) {
            currentIckWords.push(wordToAdd);
            ickWordsTextarea.value = currentIckWords.join("\n"); // Update the main textarea
            await saveIckWords();
            showToast(`'${wordToAdd}' added from suggestions!`, "success");
        } else {
            showToast(`'${wordToAdd}' is already in your list.`, "info");
        }
    }

    /**
     * Adds all suggested words to the list and saves.
     * This also updates the main textarea.
     */
    async function addAllSuggestedWords() {
        const newWords = suggestedWords.filter(word => !currentIckWords.includes(word));
        if (newWords.length > 0) {
            currentIckWords = [...currentIckWords, ...newWords]; // Add new words
            ickWordsTextarea.value = currentIckWords.join("\n"); // Update the main textarea
            await saveIckWords();
            showToast(`Added ${newWords.length} suggested words!`, "success");
        } else {
            showToast("All suggested words are already in your list.", "info");
        }
    }

    /**
     * Saves the current list of Ick Words (from currentIckWords array) to storage and informs background script.
     */
    async function saveIckWords() {
        // Ensure uniqueness and sort alphabetically for consistency
        currentIckWords = [...new Set(currentIckWords)].sort(); 

        try {
            await saveSettings({ ickWords: currentIckWords }); // From utils.js
            renderIckWords(); // Re-render sidebar chips to reflect changes (e.g., sorting, duplicates removed)
            renderSuggestedWords(); // Re-render suggested words to reflect which are now added
            // showToast("Ick List saved!", "success"); // Toast already shown by calling functions
            chrome.runtime.sendMessage({ action: "settingsUpdated" }); // Inform background script
        } catch (error) {
            console.error("Error saving ick words:", error);
            showToast("Failed to save words.", "error");
        }
    }

    /**
     * Toggles Safe Mode.
     */
    async function toggleSafeMode() {
        const isEnabled = safeModeToggle.checked;
        try {
            await saveSettings({ safeMode: isEnabled }); // From utils.js
            updateModeDependentUI(isEnabled, calmModeToggle.checked);
            showToast(`Safe Mode ${isEnabled ? 'enabled' : 'disabled'}.`, "success");
            chrome.runtime.sendMessage({ action: "settingsUpdated" }); // Inform background script
        } catch (error) {
            console.error("Error toggling safe mode:", error);
            showToast("Failed to change Safe Mode.", "error");
        }
    }

    /**
     * Toggles Calm Mode.
     */
    async function toggleCalmMode() {
        const isEnabled = calmModeToggle.checked;
        try {
            await saveSettings({ calmMode: isEnabled }); // From utils.js
            updateModeDependentUI(safeModeToggle.checked, isEnabled);
            showToast(`Calm Mode ${isEnabled ? 'enabled' : 'disabled'}.`, "success");
            chrome.runtime.sendMessage({ action: "settingsUpdated" }); // Inform background script
        } catch (error) {
            console.error("Error toggling calm mode:", error);
            showToast("Failed to change Calm Mode.", "error");
        }
    }

    /**
     * Updates UI elements that depend on Safe Mode and Calm Mode states.
     * @param {boolean} safeModeEnabled
     * @param {boolean} calmModeEnabled
     */
    function updateModeDependentUI(safeModeEnabled, calmModeEnabled) {
        // If safe mode is on, calm mode toggle should be disabled and unchecked
        if (safeModeEnabled) {
            calmModeToggle.checked = false; // Ensure calm mode is off
            calmModeToggle.disabled = true; // Disable calm mode toggle
            calmModeToggle.closest('.toggle-switch').classList.add('disabled'); // Add class to parent for styling
        } else {
            calmModeToggle.disabled = false; // Enable calm mode toggle
            calmModeToggle.closest('.toggle-switch').classList.remove('disabled'); // Remove class from parent
        }
        // Apply body classes for styling (for options.html itself)
        document.body.classList.toggle("safe-mode", safeModeEnabled);
        document.body.classList.toggle("calm-mode", calmModeEnabled && !safeModeEnabled);
    }

    /**
     * Resets all extension settings to their default values.
     */
    async function resetAllSettings() {
        try {
            await saveSettings(DEFAULT_SETTINGS); // Set all settings back to defaults (from utils.js)
            await loadAndRenderSettings(); // Reload UI to reflect defaults
            showToast("All settings reset to default!", "success");
            confirmResetModal.classList.add("hidden"); // Hide modal
            chrome.runtime.sendMessage({ action: "settingsUpdated" }); // Inform background script
        } catch (error) {
            console.error("Error resetting all settings:", error);
            showToast("Failed to reset settings.", "error");
        }
    }

    // --- Event Listeners ---

    // The main "Save Ick List" button for the textarea
    if (saveIckListBtn) { // Check if element exists
        saveIckListBtn.addEventListener("click", saveIckListFromTextarea);
    } else {
        console.error("Element with ID 'saveIckListBtn' not found.");
    }

    // Other listeners (remain mostly the same)
    addAllSuggestedBtn.addEventListener("click", addAllSuggestedWords);
    safeModeToggle.addEventListener("change", toggleSafeMode);
    calmModeToggle.addEventListener("change", toggleCalmMode);

    resetSettingsBtn.addEventListener("click", () => {
        confirmResetModal.classList.remove("hidden"); // Show confirmation modal
    });
    confirmResetBtn.addEventListener("click", resetAllSettings);
    cancelResetBtn.addEventListener("click", () => {
        confirmResetModal.classList.add("hidden"); // Hide confirmation modal
    });

    // Navigation buttons (using nav.js)
    // Ensure nav.js is loaded BEFORE this script, or that the 'goTo' function is globally available
    if (popupNavBtn && typeof goTo === 'function') {
        popupNavBtn.addEventListener("click", () => goTo("popup.html"));
    }
    if (statsNavBtn && typeof goTo === 'function') {
        statsNavBtn.addEventListener("click", () => goTo("stats.html"));
    }
    if (onboardingNavBtn && typeof goTo === 'function') {
        onboardingNavBtn.addEventListener("click", () => goTo("onboarding.html"));
    }
    if (supportNavBtn && typeof goTo === 'function') {
        supportNavBtn.addEventListener("click", () => goTo("support.html"));
    }
    if (checkinNavBtn && typeof goTo === 'function') {
        checkinNavBtn.addEventListener("click", () => goTo("checkin.html"));
    }

    // Listener for storage changes (e.g., from popup page)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.ickListSettings) {
            const newIckWords = changes.ickListSettings.newValue?.ickWords || [];
            if (JSON.stringify(newIckWords) !== JSON.stringify(currentIckWords)) { // Check for actual change to avoid infinite loops
                currentIckWords = newIckWords;
                ickWordsTextarea.value = currentIckWords.join("\n"); // Update textarea
                renderIckWords(); // Re-render chips
                renderSuggestedWords(); // Update suggested words
            }
            // Update toggles and UI if safeMode or calmMode changed
            if (changes.ickListSettings.newValue?.safeMode !== undefined || changes.ickListSettings.newValue?.calmMode !== undefined) {
                safeModeToggle.checked = changes.ickListSettings.newValue.safeMode;
                calmModeToggle.checked = changes.ickListSettings.newValue.calmMode;
                updateModeDependentUI(safeModeToggle.checked, calmModeToggle.checked);
            }
        }
    });

    // Initial load when the options page is opened
    // highlightActiveNav() needs to be defined in nav.js and accessible.
    // If nav.js is loaded as 'module' or deferred, you might need a different approach.
    if (typeof highlightActiveNav === 'function') {
        highlightActiveNav(); // From nav.js, highlights current page in nav
    } else {
        console.warn("highlightActiveNav function not found. Is nav.js loaded correctly?");
    }
    
    loadAndRenderSettings();
});