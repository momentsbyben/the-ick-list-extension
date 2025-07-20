// checkin.js
// Depends on utils.js for loadSettings, saveSettings, showToast, getTodayDateString
// Depends on nav.js for goTo

document.addEventListener("DOMContentLoaded", async () => {
    // --- Element References ---
    const checkinForm = document.getElementById("checkinForm");
    const moodInputs = document.querySelectorAll('input[name="mood"]');
    const notesTextarea = document.getElementById("notes");

    // --- Navigation Button References ---
    const backBtn = document.getElementById("backBtn");
    const viewStatsBtn = document.getElementById("viewStatsBtn");

    // --- Functions ---

    /**
     * Loads settings and pre-fills form if a check-in was already made today.
     */
    async function loadAndPrepopulateForm() {
        try {
            const settings = await loadSettings();
            const today = getTodayDateString();

            // Check if a check-in was already submitted for today
            const lastCheckinDate = settings.lastCheckinDate;
            if (lastCheckinDate === today) {
                // Find today's entry in checkInHistory
                const todayEntry = settings.checkInHistory.find(entry => entry.date === today);
                if (todayEntry) {
                    // Pre-select mood
                    moodInputs.forEach(input => {
                        if (input.value === todayEntry.mood) {
                            input.checked = true;
                        }
                    });
                    // Pre-fill notes
                    notesTextarea.value = todayEntry.notes || '';
                    showToast("You've already checked in today!", "info");
                }
            }
            updateModeDependentUI(settings.safeMode, settings.calmMode); // Apply modes if active
        } catch (error) {
            console.error("Error loading check-in data:", error);
            showToast("Failed to load check-in data.", "error");
        }
    }

    /**
     * Handles the form submission for daily check-in.
     */
    async function handleCheckinSubmit(event) {
        event.preventDefault(); // Prevent default form submission

        const selectedMood = document.querySelector('input[name="mood"]:checked');
        const notes = notesTextarea.value.trim();
        const today = getTodayDateString();

        if (!selectedMood) {
            showToast("Please select your mood.", "error");
            return;
        }

        const moodValue = selectedMood.value;

        try {
            const settings = await loadSettings();

            let { dailyStreak, lastCheckinDate, dailyStreaks, checkInHistory } = settings;

            // Update checkInHistory (find and update or add new)
            const existingEntryIndex = checkInHistory.findIndex(entry => entry.date === today);
            if (existingEntryIndex !== -1) {
                checkInHistory[existingEntryIndex] = { date: today, mood: moodValue, notes: notes };
            } else {
                checkInHistory.push({ date: today, mood: moodValue, notes: notes });
            }

            // Keep only the last 30 entries (or more, adjust as needed)
            // Sort by date to ensure recent entries are at the end
            checkInHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
            if (checkInHistory.length > 30) {
                checkInHistory = checkInHistory.slice(-30); // Keep only the last 30
            }


            // Streak logic (copied from background.js/content.js for consistency in UI)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayDateString = getTodayDateString(yesterday);

            if (lastCheckinDate === today) {
                // Already checked in today, no change to streak
                showToast("Your check-in for today has been updated!", "success");
            } else if (lastCheckinDate === yesterdayDateString) {
                // Continued streak
                dailyStreak++;
                showToast(`Check-in saved! Daily streak: ${dailyStreak} days! 🔥`, "success");
            } else {
                // New streak or broken streak
                dailyStreak = 1;
                showToast("Check-in saved! New streak started: 1 day!", "success");
            }

            // Update dailyStreaks for weekly chart
            dailyStreaks[today] = true;

            // Clean up old entries from dailyStreaks (keep only last 7 days + buffer)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(today.getDate() - 7); // Calculate the date 7 days ago
            for (const date in dailyStreaks) {
                if (new Date(date) < sevenDaysAgo) {
                    delete dailyStreaks[date];
                }
            }


            // Save updated settings
            await saveSettings({
                dailyStreak: dailyStreak,
                lastCheckinDate: today,
                dailyStreaks: dailyStreaks,
                checkInHistory: checkInHistory
            });

            // Optionally, disable form or redirect
            checkinForm.querySelector('button[type="submit"]').disabled = true;
            setTimeout(() => {
                if (typeof goTo === 'function') {
                    goTo('stats.html'); // Redirect to stats after saving
                } else {
                    window.close(); // Close popup if goTo is not available (e.g., if nav.js not loaded)
                }
            }, 1500); // Give user a moment to see toast
        } catch (error) {
            console.error("Error saving check-in:", error);
            showToast("Failed to save check-in.", "error");
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
    checkinForm.addEventListener("submit", handleCheckinSubmit);

    // Navigation buttons (using nav.js)
    if (backBtn && typeof goTo === 'function') {
        // You'll need to decide where 'Back' should go. Assuming popup.html or options.html
        // For now, let's point it to popup.html as a common "main" page
        backBtn.addEventListener("click", () => goTo("popup.html"));
    }
    if (viewStatsBtn && typeof goTo === 'function') {
        viewStatsBtn.addEventListener("click", () => goTo("stats.html"));
    }

    // Initial load and prepopulate
    loadAndPrepopulateForm();
    highlightActiveNav(); // From nav.js
});