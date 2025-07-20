// stats.js
// Depends on utils.js for loadSettings, saveSettings, showToast, getTodayDateString
// Depends on nav.js for goTo

document.addEventListener("DOMContentLoaded", async () => {
    // --- Element References ---
    const mostRevealedEl = document.getElementById("mostRevealed");
    const revealStatsList = document.getElementById("revealStatsList");
    const refreshStatsBtn = document.getElementById("refreshStatsBtn");
    const exportStatsBtn = document.getElementById("exportStatsBtn");
    const resetStatsBtn = document.getElementById("resetStatsBtn");
    const confirmModal = document.getElementById("confirmModal");
    const confirmResetBtn = document.getElementById("confirmReset");
    const cancelResetBtn = document.getElementById("cancelReset");
    const currentStreakEl = document.getElementById("currentStreakEl"); // Element for streak
    const weeklyUsageChart = document.getElementById("weeklyUsageChart"); // Element for weekly usage

    // --- Navigation Button Reference ---
    const optionsNavBtn = document.getElementById("optionsNavBtn"); // New nav button

    // --- Functions ---

    /**
     * Loads settings and renders all statistics.
     */
    async function loadAndRenderStats() {
        try {
            const settings = await loadSettings();
            const { revealStats, dailyStreak, dailyStreaks, lastCheckinDate, safeMode, calmMode } = settings;

            updateModeDependentUI(safeMode, calmMode); // Apply modes for styling

            // Render Reveal Stats
            renderRevealStats(revealStats);

            // Render Daily Streak and Weekly Usage
            updateStreakAndUsageDisplay(dailyStreak, dailyStreaks, lastCheckinDate);

            showToast("Stats loaded successfully!", "success");
        } catch (error) {
            console.error("Error loading and rendering stats:", error);
            showToast("Failed to load statistics.", "error");
        }
    }

    /**
     * Renders the reveal statistics list.
     * @param {Object} revealStats - Object containing revealed word counts.
     */
    function renderRevealStats(revealStats) {
        revealStatsList.innerHTML = ""; // Clear existing list
        const sortedStats = Object.entries(revealStats).sort(([, a], [, b]) => b - a);

        if (sortedStats.length === 0) {
            revealStatsList.innerHTML = "<p>No words or phrases have been revealed yet.</p>";
            mostRevealedEl.textContent = "Your reveal data is empty.";
            return;
        }

        // Display most revealed
        const [mostRevealedWord, mostRevealedCount] = sortedStats[0];
        mostRevealedEl.textContent = `Most Revealed: "${mostRevealedWord}" (${mostRevealedCount} times)`;

        // Display full list
        sortedStats.forEach(([word, count]) => {
            const li = document.createElement("li");
            li.textContent = `"${word}" : ${count} times`;
            revealStatsList.appendChild(li);
        });
    }

    /**
     * Updates the displayed streak and weekly usage bar.
     * This function is duplicated from popup.js for this page's display.
     * @param {number} dailyStreak
     * @param {Object} dailyStreaks - A map of "YYYY-MM-DD": true
     * @param {string} lastCheckinDate - The last date of activity "YYYY-MM-DD"
     */
    function updateStreakAndUsageDisplay(dailyStreak, dailyStreaks, lastCheckinDate) {
        currentStreakEl.innerHTML = `<span class="streak-label">Current Streak:</span> <span class="highlight">${dailyStreak} day${dailyStreak !== 1 ? 's' : ''}</span>`;

        weeklyUsageChart.innerHTML = ""; // Clear previous content
        const today = new Date();
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - (6 - i)); // Go back 6 days from today to display 7 days
            const dateString = getTodayDateString(date); // Use utils.js helper
            const dayName = days[date.getDay()];
            const isActive = dailyStreaks[dateString]; // Check if this date has activity

            const dayElement = document.createElement('div');
            dayElement.className = 'day-bar';
            if (isActive) {
                dayElement.classList.add('active');
            }
            dayElement.title = `${dayName}, ${dateString}`; // Tooltip on hover
            dayElement.textContent = dayName.substring(0, 3); // Display 3-letter day initial

            weeklyUsageChart.appendChild(dayElement);
        }
    }

    /**
     * Exports reveal statistics as a JSON file.
     */
    async function exportStats() {
        try {
            const settings = await loadSettings();
            const dataStr = JSON.stringify(settings.revealStats, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const filename = `ick-list-reveal-stats-${getTodayDateString()}.json`;

            chrome.downloads.download({
                url: url,
                filename: filename,
                saveAs: true // Prompt user for location
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Download failed:", chrome.runtime.lastError);
                    showToast("Export failed: " + chrome.runtime.lastError.message, "error");
                } else {
                    showToast("Reveal stats exported!", "success");
                }
                URL.revokeObjectURL(url); // Clean up
            });

        } catch (error) {
            console.error("Error exporting stats:", error);
            showToast("Failed to export stats.", "error");
        }
    }

    /**
     * Resets reveal statistics to empty.
     */
    async function resetRevealStats() {
        try {
            await saveSettings({ revealStats: {} }); // Clear reveal stats
            confirmModal.classList.add("hidden"); // Hide modal
            await loadAndRenderStats(); // Reload to show empty stats
            showToast("Reveal stats reset!", "success");
        } catch (error) {
            console.error("Error resetting reveal stats:", error);
            showToast("Failed to reset stats.", "error");
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
    refreshStatsBtn.addEventListener("click", loadAndRenderStats);
    exportStatsBtn.addEventListener("click", exportStats);
    resetStatsBtn.addEventListener("click", () => {
        confirmModal.classList.remove("hidden"); // Show confirmation modal
    });
    confirmResetBtn.addEventListener("click", resetRevealStats);
    cancelResetBtn.addEventListener("click", () => {
        confirmModal.classList.add("hidden"); // Hide confirmation modal
    });

    // Navigation button
    if (optionsNavBtn && typeof goTo === 'function') {
        optionsNavBtn.addEventListener("click", () => goTo("options.html"));
    }

    // Initial load of stats when the page is opened
    loadAndRenderStats();
    highlightActiveNav(); // From nav.js
});