// utils.js

const DEFAULT_SETTINGS = {
    ickWords: [],
    safeMode: false,
    calmMode: false,
    dailyStreak: 0, // Current consecutive daily check-ins
    lastCheckinDate: null, // YYYY-MM-DD format of the last check-in
    dailyStreaks: {}, // Object to store check-in status for the last 7 days { 'YYYY-MM-DD': true/false }
    revealStats: {}, // Stores counts of revealed words/phrases: { "word": count, "phrase": count }
    checkInHistory: [], // Array of objects: [{ date: "YYYY-MM-DD", mood: "😊", notes: "..." }]
    onboardingProfile: { // New settings for onboarding
        username: null,
        age: null,
        gender: null,
        country: null,
        supportType: null, // e.g., "anxiety", "depression"
        goal: null // e.g., "reduce social media", "manage stress"
    },
    onboardingComplete: false, // Flag to indicate if onboarding has been completed
    totalIckWordsDetected: 0, // Added based on background.js usage
    dailyWordCounts: {} // Added based on background.js usage
};

/**
 * Loads extension settings from Chrome storage (local).
 * @returns {Promise<Object>} A promise that resolves with the settings object.
 */
async function loadSettings() {
    try {
        const result = await chrome.storage.local.get("ickListSettings"); // CHANGED to .local
        return { ...DEFAULT_SETTINGS, ...result.ickListSettings };
    } catch (error) {
        console.error("Error loading settings:", error);
        // Fallback to default settings if loading fails
        return DEFAULT_SETTINGS;
    }
}

/**
 * Saves extension settings to Chrome storage (local).
 * @param {Object} newSettings - An object containing the settings to save (will be merged with current settings).
 * @returns {Promise<void>} A promise that resolves when settings are saved.
*/
async function saveSettings(newSettings) {
    try {
        const currentSettings = await loadSettings();
        const mergedSettings = { ...currentSettings, ...newSettings };
        await chrome.storage.local.set({ ickListSettings: mergedSettings }); // CHANGED to .local
        console.log("Settings saved:", mergedSettings);
    } catch (error) {
        console.error("Error saving settings:", error);
        throw error; // Re-throw to allow calling functions to handle
    }
}

/**
 * Displays a toast notification to the user.
 * @param {string} message - The message to display.
 * @param {string} type - The type of toast (e.g., 'success', 'error', 'info').
 */
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        console.warn("Toast container not found. Cannot show toast:", message);
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Trigger reflow to enable CSS transition
    void toast.offsetWidth;

    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        // Ensure the toast is removed after the transition completes
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 3000); // Hide after 3 seconds (adjust as needed for CSS transition duration)
}

/**
 * Gets the current date string in YYYY-MM-DD format.
 * @param {Date} [dateObj=new Date()] - Optional Date object to format. Defaults to current date.
 * @returns {string} The formatted date string.
 */
function getTodayDateString(dateObj = new Date()) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}