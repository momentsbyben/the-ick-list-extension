// nav.js

/**
 * Navigates to a specified HTML page within the extension.
 * @param {string} page - The name of the HTML file (e.g., "options.html").
 */
function goTo(page) {
    chrome.tabs.create({ url: chrome.runtime.getURL(page) });
    // For popup, this closes the popup and opens new tab.
    // For full page (options, stats etc.), it just opens a new tab.
    // If you want popups to navigate within themselves, you'd modify document.location.href.
    // But for different "pages", chrome.tabs.create is typical.
}

/**
 * Highlights the active navigation button based on the current page's filename.
 * This function should be called on DOMContentLoaded for pages that have navigation.
 */
function highlightActiveNav() {
    const path = window.location.pathname;
    const currentPage = path.substring(path.lastIndexOf('/') + 1);

    // Common button IDs and their corresponding page files
    const navMap = {
        'popupNavBtn': 'popup.html',
        'optionsNavBtn': 'options.html',
        'statsNavBtn': 'stats.html',
        'onboardingNavBtn': 'onboarding.html',
        'supportNavBtn': 'support.html',
        'checkinNavBtn': 'checkin.html',
    };

    for (const [btnId, pageFile] of Object.entries(navMap)) {
        const btn = document.getElementById(btnId);
        if (btn) {
            if (currentPage === pageFile) {
                btn.classList.add('active-nav'); // Add a class for active state styling
            } else {
                btn.classList.remove('active-nav');
            }
        }
    }
}

// You might call highlightActiveNav() on DOMContentLoaded in each HTML file's specific JS
// E.g., document.addEventListener("DOMContentLoaded", highlightActiveNav);