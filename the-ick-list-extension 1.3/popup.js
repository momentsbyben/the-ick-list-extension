// popup.js
// Depends on utils.js for loadSettings, saveSettings, showToast, getTodayDateString
// Depends on nav.js for goTo

document.addEventListener("DOMContentLoaded", async () => {
    // --- Element References ---
    const ickWordList = document.getElementById("ickWordList");
    const ickWordInput = document.getElementById("ickWordInput");
    const addIckWordBtn = document.getElementById("addIckWordBtn");
    const safeModeToggle = document.getElementById("safeModeToggle");
    const calmModeToggle = document.getElementById("calmModeToggle");
    const currentStreakEl = document.getElementById("currentStreak");
    const weekUsageBar = document.getElementById("weeklyUsageChart");
    const modeStatusText = document.getElementById("modeStatusText");
    const inlineFlameIcon = document.querySelector(".flame-icon-inline"); // Reference to the inline flame for glow

    // --- Navigation Button References ---
    const refreshPageBtn = document.getElementById("refreshPageBtn");
    const optionsBtn = document.getElementById("optionsBtn");
    const statsBtn = document.getElementById("statsBtn");
    const supportBtn = document.getElementById("supportBtn");
    const checkinBtn = document.getElementById("checkinBtn"); // Corrected ID to match HTML
    // Onboarding button is not in popup.html, removed reference.

    // --- State Variables ---
    let currentIckWords = [];

    // --- Functions ---

    /**
     * Loads settings and updates the UI.
     */
    async function loadAndRenderSettings() {
        try {
            const settings = await loadSettings();
            currentIckWords = settings.ickWords || [];
            safeModeToggle.checked = settings.safeMode;
            calmModeToggle.checked = settings.calmMode;

            renderIckWords();
            updateModeDependentUI(settings.safeMode, settings.calmMode);

            // Update streak and weekly usage for display
            updateStreakAndUsageDisplay(settings.dailyStreak, settings.dailyStreaks, settings.lastCheckinDate);
            
            // Apply pulsating glow to flame icon if streak is active
            if (settings.dailyStreak > 0 && inlineFlameIcon) {
                inlineFlameIcon.classList.add('glow');
            } else if (inlineFlameIcon) {
                inlineFlameIcon.classList.remove('glow');
            }

            console.log("Popup settings loaded and rendered.");

        } catch (error) {
            console.error("Error loading settings in popup:", error);
            showToast("Failed to load settings.", "error");
        }
    }

    /**
     * Renders the list of Ick Words in the UI as word chips.
     */
    function renderIckWords() {
        ickWordList.innerHTML = ""; // Clear existing list
        if (currentIckWords.length === 0) {
            ickWordList.innerHTML = "<p class='no-words-message'>No words added yet. Add some below!</p>";
            return;
        }
        currentIckWords.forEach(word => {
            const wordChip = document.createElement("div"); // Use div for word chip
            wordChip.className = "word-chip"; // Apply word-chip class

            const wordText = document.createElement("span");
            wordText.textContent = word;

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "✖";
            deleteBtn.className = "delete-btn"; // Apply delete-btn class
            deleteBtn.title = `Remove '${word}'`; // Add tooltip
            deleteBtn.addEventListener("click", (e) => {
                e.stopPropagation(); // Prevent potential parent clicks
                removeIckWord(word);
            });

            wordChip.appendChild(wordText);
            wordChip.appendChild(deleteBtn);
            ickWordList.appendChild(wordChip);
        });
    }

    /**
     * Adds a new Ick Word to the list.
     */
    async function addIckWord() {
        const word = ickWordInput.value.trim().toLowerCase(); // Normalize to lowercase
        if (word && !currentIckWords.includes(word)) {
            currentIckWords.push(word);
            ickWordInput.value = ""; // Clear input
            await saveIckWords();
            showToast(`'${word}' added!`, "success");
        } else if (word && currentIckWords.includes(word)) {
            showToast(`'${word}' is already in your list.`, "info");
        } else {
            showToast("Please enter a word or phrase.", "error");
        }
    }

    /**
     * Removes an Ick Word from the list.
     * @param {string} wordToRemove - The word to remove.
     */
    async function removeIckWord(wordToRemove) {
        currentIckWords = currentIckWords.filter(word => word !== wordToRemove);
        await saveIckWords();
        showToast(`'${wordToRemove}' removed.`, "success");
    }

    /**
     * Saves the current list of Ick Words to storage and re-renders.
     * DOES NOT RELOAD TABS here, background.js handles content script updates.
     */
    async function saveIckWords() {
        try {
            await saveSettings({ ickWords: currentIckWords });
            renderIckWords(); // Re-render the list immediately
            // Send message to background to trigger content script updates on open tabs
            chrome.runtime.sendMessage({ action: "settingsUpdated" });
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
            const settings = await loadSettings(); // Get current settings to prevent race condition
            // If safe mode is being enabled, disable calm mode
            if (isEnabled && settings.calmMode) {
                calmModeToggle.checked = false; // Uncheck calm mode if safe mode is on
                await saveSettings({ safeMode: isEnabled, calmMode: false }); // Save both
                showToast("Safe Mode enabled (Calm Mode disabled).", "success");
            } else {
                await saveSettings({ safeMode: isEnabled });
                showToast(`Safe Mode ${isEnabled ? 'enabled' : 'disabled'}.`, "success");
            }
            updateModeDependentUI(safeModeToggle.checked, calmModeToggle.checked);
            chrome.runtime.sendMessage({ action: "settingsUpdated" }); // Inform background
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
            const settings = await loadSettings();
            // Calm mode can only be enabled if safe mode is off
            if (isEnabled && settings.safeMode) {
                calmModeToggle.checked = false; // Keep it unchecked
                showToast("Calm Mode cannot be enabled when Safe Mode is active.", "info");
            } else {
                await saveSettings({ calmMode: isEnabled });
                showToast(`Calm Mode ${isEnabled ? 'enabled' : 'disabled'}.`, "success");
            }
            updateModeDependentUI(safeModeToggle.checked, calmModeToggle.checked);
            chrome.runtime.sendMessage({ action: "settingsUpdated" }); // Inform background
        } catch (error) {
            console.error("Error toggling calm mode:", error);
            showToast("Failed to change Calm Mode.", "error");
        }
    }

    /**
     * Updates UI elements that depend on Safe Mode and Calm Mode states.
     * Also updates the mode status text.
     * @param {boolean} safeModeEnabled
     * @param {boolean} calmModeEnabled
     */
    function updateModeDependentUI(safeModeEnabled, calmModeEnabled) {
        // Handle Calm Mode toggle state and styling based on Safe Mode
        if (safeModeEnabled) {
            calmModeToggle.checked = false; // Ensure calm mode is off visually
            calmModeToggle.disabled = true; // Disable calm mode toggle
            calmModeToggle.closest('.toggle-switch').classList.add('disabled');
        } else {
            calmModeToggle.disabled = false; // Enable calm mode toggle
            calmModeToggle.closest('.toggle-switch').classList.remove('disabled');
        }

        // Apply body classes for styling in popup.html (and other extension pages via common update)
        // Ensure that calm-mode is only applied if safe-mode is NOT enabled.
        document.body.classList.toggle("safe-mode", safeModeEnabled);
        document.body.classList.toggle("calm-mode", calmModeEnabled && !safeModeEnabled);


        // Update mode status text
        if (safeModeEnabled) {
            modeStatusText.textContent = "Safe Mode is ON. All content requires confirmation to reveal.";
        } else if (calmModeEnabled && !safeModeEnabled) { // Ensure calm mode is only shown if safe mode is off
            modeStatusText.textContent = "Calm Mode is ON. Long-press to reveal content.";
        } else {
            modeStatusText.textContent = "Both modes are OFF. Click to reveal content.";
        }
    }

    /**
     * Updates the displayed streak and weekly usage bar.
     * @param {number} dailyStreak
     * @param {Object} dailyStreaks - A map of "YYYY-MM-DD": true
     * @param {string} lastCheckinDate - The last date of activity "YYYY-MM-DD"
     */
    function updateStreakAndUsageDisplay(dailyStreak, dailyStreaks, lastCheckinDate) {
        // Update Streak Display
        currentStreakEl.innerHTML = `<span class="streak-label">Current Streak:</span> <span class="highlight">${dailyStreak} day${dailyStreak !== 1 ? 's' : ''}</span>`;

        // Update Weekly Usage Bar
        weekUsageBar.innerHTML = ""; // Clear previous content
        const today = new Date();
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - (6 - i)); // Go back 6 days from today to display 7 days
            const dateString = getTodayDateString(date); // Use utils.js helper
            const dayName = days[date.getDay()];
            const isActive = dailyStreaks && dailyStreaks[dateString]; // Check if this date has activity and dailyStreaks exists

            const dayElement = document.createElement('div');
            dayElement.className = 'day-bar';
            if (isActive) {
                dayElement.classList.add('active');
            }
            dayElement.title = `${dayName}, ${dateString}`; // Tooltip on hover
            dayElement.textContent = dayName.substring(0, 3); // Display 3-letter day initial

            weekUsageBar.appendChild(dayElement);
        }
    }

    // --- Event Listeners ---

    addIckWordBtn.addEventListener("click", addIckWord);
    ickWordInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            addIckWord();
        }
    });
    safeModeToggle.addEventListener("change", toggleSafeMode);
    calmModeToggle.addEventListener("change", toggleCalmMode);

    // Refresh Page button listener (only reloads the active tab where the popup is open)
    refreshPageBtn.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.reload(tabs[0].id);
                showToast("Page refreshed!", "info");
            }
        });
    });

    // Navigation buttons (using nav.js)
    // Ensure all these buttons have the correct IDs in popup.html
    if (optionsBtn && typeof goTo === 'function') {
        optionsBtn.addEventListener("click", () => goTo("options.html"));
    }
    if (statsBtn && typeof goTo === 'function') {
        statsBtn.addEventListener("click", () => goTo("stats.html"));
    }
    // removed onboardingBtn listener as onboarding.html is not a navigation target from popup.html based on structure
    if (supportBtn && typeof goTo === 'function') {
        supportBtn.addEventListener("click", () => goTo("support.html"));
    }
    if (checkinBtn && typeof goTo === 'function') {
        checkinBtn.addEventListener("click", () => goTo("checkin.html"));
    }

    // Listener for storage changes (e.g., from options page)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.calmMode || changes.safeMode || changes.dailyStreak || changes.dailyStreaks || changes.lastCheckinDate) {
                // Only re-render specific parts of UI, don't fully reload everything
                loadAndRenderSettings(); // This will update toggles, streak, modes text, etc.
            }
            if (changes.ickWords) {
                currentIckWords = changes.ickWords.newValue || [];
                renderIckWords(); // Only re-render word list
            }
        }
    });

    // Initial load of settings and UI rendering
    loadAndRenderSettings();
});