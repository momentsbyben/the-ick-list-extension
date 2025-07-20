// background.js
// This script runs in the background and handles overall extension logic,
// including initial setup, managing communication, and potentially streaks/stats.
// Depends on utils.js for loadSettings, saveSettings, DEFAULT_SETTINGS, getTodayDateString

importScripts('utils.js'); // CRITICAL: Imports functions like loadSettings, saveSettings, getTodayDateString

console.log("Background script loaded.");

// --- On Installation: Set Default Settings ---
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        console.log("Extension installed. Initializing default settings.");
        await saveSettings(DEFAULT_SETTINGS); // Uses saveSettings from utils.js (which should use chrome.storage.local)
        // Optionally open the onboarding page on first install
        chrome.tabs.create({ url: "onboarding.html" });
    }
    // For updating, you might migrate settings if needed, but for now, no action.
    // The existing settings will automatically merge with DEFAULT_SETTINGS on subsequent loads
    // if `loadSettings` is designed to provide defaults for missing keys.
});

// --- Listen for Messages from Popup/Options and Content Scripts ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => { // Use an async IIFE to allow await inside the listener
        const today = getTodayDateString(); // From utils.js
        let settings;

        switch (request.action) {
            case "settingsUpdated":
                console.log("Background script: Received 'settingsUpdated' from a UI page. Broadcasting to content scripts.");
                // When settings are updated (from popup or options),
                // we need to tell all active content scripts to re-apply censorship.
                chrome.tabs.query({}, (tabs) => {
                    tabs.forEach(tab => {
                        // Ensure it's a valid URL that content scripts can run on
                        if (tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("edge://")) {
                            chrome.tabs.sendMessage(tab.id, { action: "updateSettings" })
                                .catch(error => {
                                    // This catch handles tabs where content script might not be injected
                                    // (e.g., chrome:// pages, or if the tab hasn't fully loaded yet)
                                    if (!error.message.includes("Could not establish connection")) {
                                        console.warn(`Error sending message to tab ${tab.id}:`, error);
                                    }
                                });
                        }
                    });
                });
                sendResponse({ success: true }); // Acknowledge receipt
                break;

            case "userActivity":
                // This message comes from content.js when user activity (e.g., detected word) occurs.
                // It's used to update the daily streak.
                // console.log("User activity detected, updating streak.");
                await updateDailyStreak(); // Call the streak update function
                sendResponse({ success: true });
                break;

            case "incrementIckCount":
                settings = await loadSettings(); // From utils.js
                settings.totalIckWordsDetected = (settings.totalIckWordsDetected || 0) + 1;
                settings.dailyWordCounts = settings.dailyWordCounts || {};
                settings.dailyWordCounts[today] = (settings.dailyWordCounts[today] || 0) + 1;
                await saveSettings(settings); // From utils.js
                console.log(`Ick word detected: ${request.word}. Total: ${settings.totalIckWordsDetected}, Today: ${settings.dailyWordCounts[today]}`);
                sendResponse({ success: true, total: settings.totalIckWordsDetected, today: settings.dailyWordCounts[today] });
                break;

            case "updateLastCheckin": // This can be used by a "Check-in" button
                settings = await loadSettings();
                settings.lastCheckinDate = today; // Mark today as checked in
                settings.dailyStreaks = settings.dailyStreaks || {};
                settings.dailyStreaks[today] = true; // Explicitly mark today as active
                await saveSettings(settings);
                console.log(`User checked in. lastCheckinDate updated to ${today}.`);
                // Immediately re-run streak update to reflect the new check-in
                await updateDailyStreak(); 
                sendResponse({ success: true, updatedStreak: settings.dailyStreak });
                break;

            case "requestSettings": // For other scripts to request current settings
                settings = await loadSettings();
                sendResponse(settings);
                break;
            
            default:
                console.warn("Unknown message action:", request.action);
                sendResponse({ success: false, message: "Unknown action" });
                break;
        }
    })();
    return true; // Indicates that sendResponse will be called asynchronously
});

// --- Streak and Daily Check-in Logic ---

/**
 * Updates the daily streak based on tracked activity (userActivity message)
 * or triggered by the daily alarm/startup.
 */
async function updateDailyStreak() {
    try {
        const today = getTodayDateString(); // From utils.js
        const settings = await loadSettings(); // From utils.js

        let { dailyStreak = 0, lastCheckinDate = null, dailyStreaks = {}, dailyWordCounts = {} } = settings;

        // Mark today as active if a check-in has already occurred or activity detected today
        // This ensures the current day is always counted if there's any interaction.
        if (dailyWordCounts[today] > 0 || (dailyStreaks && dailyStreaks[today])) {
            if (lastCheckinDate !== today) { // If it's a new day, but already have activity
                const yesterday = getTodayDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
                if (lastCheckinDate === yesterday) {
                    // If last check-in was yesterday, continue streak
                    dailyStreak++;
                } else {
                    // If last check-in was not yesterday and not today, reset streak (or start new if 0)
                    dailyStreak = 1; // Start a new streak if activity happens today after a gap
                }
            }
            // Ensure today is marked active for the usage chart
            dailyStreaks[today] = true;
            lastCheckinDate = today; // Update lastCheckinDate to today as there's activity
        } else {
            // No activity detected for today yet. Check if streak should be broken.
            const yesterday = getTodayDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
            if (lastCheckinDate !== today && lastCheckinDate !== yesterday) {
                dailyStreak = 0; // Streak broken if no activity yesterday or today
            }
        }

        // Clean up old entries from dailyStreaks and dailyWordCounts (keep last ~8 days for chart + buffer)
        const cutoffDate = getTodayDateString(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));
        
        const newDailyStreaks = {};
        for (const date in dailyStreaks) {
            if (date >= cutoffDate) {
                newDailyStreaks[date] = dailyStreaks[date];
            }
        }
        
        const newDailyWordCounts = {};
        for (const date in dailyWordCounts) {
            if (date >= cutoffDate) {
                newDailyWordCounts[date] = dailyWordCounts[date];
            }
        }

        await saveSettings({
            dailyStreak: dailyStreak,
            lastCheckinDate: lastCheckinDate,
            dailyStreaks: newDailyStreaks,
            dailyWordCounts: newDailyWordCounts
        });
        // console.log(`Daily streak updated: ${dailyStreak} days. Last check-in: ${lastCheckinDate}`);

    } catch (error) {
        console.error("Error updating daily streak and counts:", error);
    }
}

/**
 * Sets up a daily alarm for streak checking.
 * Ensures the alarm is set to fire at a predictable time (e.g., 3 AM).
 */
function setupDailyAlarm() {
    // Clear any existing alarm to prevent duplicates
    chrome.alarms.clear("dailyStreakCheck");

    const now = new Date();
    let nextAlarm = new Date();
    nextAlarm.setDate(now.getDate()); // Start with today's date
    nextAlarm.setHours(3, 0, 0, 0); // Set to 3 AM today

    // If 3 AM today has already passed, set it for 3 AM tomorrow
    if (now.getTime() >= nextAlarm.getTime()) {
        nextAlarm.setDate(now.getDate() + 1); // Move to tomorrow
    }

    const delayInMinutes = Math.max(1, Math.round((nextAlarm.getTime() - now.getTime()) / (1000 * 60)));

    chrome.alarms.create("dailyStreakCheck", {
        when: nextAlarm.getTime(), // Fire at the specific timestamp
        periodInMinutes: 24 * 60 // Subsequent alarms every 24 hours
    });
    console.log(`Daily streak check alarm set for ${nextAlarm.toLocaleString()} (in ${delayInMinutes} minutes)`);
}

// --- Event Listeners and Initial Setup ---

// Listener for alarm to check daily streak.
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "dailyStreakCheck") {
        console.log("Daily streak check alarm fired by system.");
        await updateDailyStreak();
    }
});

// On extension startup (e.g., browser launched, extension enabled)
chrome.runtime.onStartup.addListener(() => {
    console.log("Extension starting up. Initializing streak and setting daily alarm.");
    setupDailyAlarm(); // Ensure the daily alarm is always set
    updateDailyStreak(); // Run streak update immediately on startup
});

// Call setupDailyAlarm and updateDailyStreak on initial script load
// (This covers the first time the service worker runs after installation or update)
setupDailyAlarm();
updateDailyStreak();