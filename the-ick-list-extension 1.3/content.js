// content.js
// Depends on utils.js for loadSettings, saveSettings, DEFAULT_SETTINGS

let ickWords = [];
let safeMode = false;
let calmMode = false;
let ickRegex; // Defined here, initialized in initializeContentScript
let observer; // MutationObserver instance

// This map will store the interval IDs for each span that is counting down
// so we can clear them if the user clicks again or reveals all.
const countdownIntervals = new Map();

// Global elements managed by content.js
let revealAllButton;
let hideAllButton;
let toastElement;
let countdownOverlayElement; // New global element for the countdown overlay
let ickModalElement; // New global element for the modal - This will now be dynamically managed by showIckModal

// --- Utility Functions ---

// Regular expression to match whole words and phrases (case-insensitive)
function createIckRegex(words) {
    if (!words || words.length === 0) {
        return null;
    }
    // Escape special characters in words for regex, and join with | for OR
    const escapedWords = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    // Use \b for word boundaries to match whole words/phrases
    return new RegExp(`\\b(?:${escapedWords.join('|')})\\b`, 'gi');
}

/**
 * Clears any active countdown for a given element.
 * @param {HTMLElement} element
 */
function clearCountdown(element) {
    const intervalId = countdownIntervals.get(element);
    if (intervalId) {
        clearInterval(intervalId);
        countdownIntervals.delete(element);
        delete element.dataset.countdown;
        element.classList.remove('revealed-pending');
        // Hide the global countdown overlay if it was for this element
        if (countdownOverlayElement && element.dataset.hasCountdownOverlay) { // Only hide if it was specifically for this element
            countdownOverlayElement.classList.remove('show');
            // Remove from DOM after transition for cleanup
            setTimeout(() => {
                if (countdownOverlayElement && !countdownOverlayElement.classList.contains('show')) {
                    countdownOverlayElement.remove();
                    countdownOverlayElement = null; // Reset to null so it's re-created next time
                }
            }, 300); // Wait for transition to finish
            delete element.dataset.hasCountdownOverlay; // Clear the flag
        }
    }
}

/**
 * Shows a toast notification on the page.
 * @param {string} message - The message to display.
 * @param {string} type - 'success', 'error', or 'info'.
 */
function showContentToast(message, type = 'info') {
    if (!toastElement) {
        toastElement = document.createElement('div');
        toastElement.className = 'content-toast';
        document.body.appendChild(toastElement);
    }

    // Clear any existing classes and add new ones
    toastElement.className = 'content-toast'; // Reset to base class
    toastElement.textContent = message;
    toastElement.classList.add('show');
    toastElement.classList.add(type);

    // Clear any existing timeout to keep the toast visible if a new message comes
    if (toastElement.timeoutId) {
        clearTimeout(toastElement.timeoutId);
    }

    toastElement.timeoutId = setTimeout(() => {
        toastElement.classList.remove('show');
        // Remove from DOM after transition for cleanup
        setTimeout(() => {
            if (toastElement && !toastElement.classList.contains('show')) {
                toastElement.remove();
                toastElement = null; // Reset to null so it's re-created next time
            }
        }, 400); // Wait for transition to finish
    }, 3000); // Display for 3 seconds
}

/**
 * Shows a modal confirmation dialog.
 * @param {string} message - The message to display in the modal.
 * @param {string} confirmText - Text for the confirm button.
 * @param {string} cancelText - Text for the cancel button.
 * @param {boolean} isLinkConfirmation - Whether this modal is for link confirmation (shows 'Go to Link' button).
 * @param {string|null} linkHref - The href to navigate to if 'Go to Link' is clicked. Only if isLinkConfirmation is true.
 * @returns {Promise<boolean|'link'>} Resolves true if confirmed, false if cancelled, 'link' if link button clicked.
 */
function showIckModal(message, confirmText = 'Confirm', cancelText = 'Cancel', isLinkConfirmation = false, linkHref = null) {
    return new Promise((resolve) => {
        if (!ickModalElement) {
            ickModalElement = document.createElement('div');
            ickModalElement.className = 'ick-modal';
            ickModalElement.innerHTML = `
                <div class="ick-modal-content">
                    <p>${message}</p>
                    <div class="ick-modal-buttons">
                        <button class="ick-confirm">${confirmText}</button>
                        <button class="ick-cancel">${cancelText}</button>
                        <button class="ick-go-to-link" style="display:none;">Go to Link</button>
                    </div>
                </div>
            `;
            document.body.appendChild(ickModalElement);
        } else {
            // Update content if modal already exists but hidden
            ickModalElement.querySelector('p').textContent = message;
            ickModalElement.querySelector('.ick-confirm').textContent = confirmText;
            ickModalElement.querySelector('.ick-cancel').textContent = cancelText;
        }

        const confirmBtn = ickModalElement.querySelector('.ick-confirm');
        const cancelBtn = ickModalElement.querySelector('.ick-cancel');
        const goToLinkBtn = ickModalElement.querySelector('.ick-go-to-link');

        // Show/hide and set text for the Go to Link button
        if (goToLinkBtn) {
            if (isLinkConfirmation) {
                goToLinkBtn.style.display = ''; // Show
                goToLinkBtn.textContent = 'Go to Link';
            } else {
                goToLinkBtn.style.display = 'none'; // Hide
            }
        }

        // Remove previous listeners to prevent duplicates
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        if (goToLinkBtn) goToLinkBtn.onclick = null;

        const cleanup = () => {
            ickModalElement.classList.remove('show');
            setTimeout(() => {
                // Remove from DOM after transition
                if (ickModalElement && !ickModalElement.classList.contains('show')) {
                    ickModalElement.remove();
                    ickModalElement = null; // Reset to null so it's re-created next time
                }
            }, 300); // Match CSS transition duration
        };

        confirmBtn.addEventListener('click', () => {
            cleanup();
            resolve(true);
        }, { once: true });

        cancelBtn.addEventListener('click', () => {
            cleanup();
            resolve(false);
        }, { once: true });

        if (goToLinkBtn && isLinkConfirmation) {
            goToLinkBtn.addEventListener('click', () => {
                cleanup();
                resolve('link');
            }, { once: true });
        }

        ickModalElement.classList.add('show');
    });
}


/**
 * Censors text nodes containing ick words/phrases.
 * @param {Node} node - The text node to process.
 * @returns {boolean} True if content was censored, false otherwise.
 */
function censorTextNode(node) {
    // Skip if parent is already hidden to prevent double-processing or recursion
    if (!ickRegex || !node || node.nodeType !== Node.TEXT_NODE || node.parentNode.nodeName === 'STYLE' || node.parentNode.nodeName === 'SCRIPT' || node.parentNode.classList.contains('ick-hidden') || node.parentNode.classList.contains('revealed')) {
        return false;
    }

    let originalContent = node.textContent;
    const parent = node.parentNode;
    if (!parent) return false; // Node might have been detached

    let lastIndex = 0;
    let match;
    const newNodes = []; // Array to hold new nodes to replace the original text node
    let censoredCount = 0;
    const uniqueCensoredWords = new Set(); // To store words that were censored for reporting

    // Iterate through all matches
    while ((match = ickRegex.exec(originalContent)) !== null) {
        censoredCount++;
        uniqueCensoredWords.add(match[0]); // Add the full matched word/phrase

        // Add the text before the current match
        if (match.index > lastIndex) {
            newNodes.push(document.createTextNode(originalContent.substring(lastIndex, match.index)));
        }

        // Create the replacement span for the current match
        const replacementSpan = document.createElement('span');
        replacementSpan.className = 'ick-hidden'; // Start hidden
        replacementSpan.textContent = match[0]; // The actual matched text will be blurred
        replacementSpan.dataset.originalText = match[0]; // Store original text for easy re-hiding

        // Check if the span is inside an anchor tag
        const closestLink = parent.closest('a');
        if (closestLink) {
            replacementSpan.dataset.isLink = 'true'; // Mark as link-related
            if (closestLink.href) {
                replacementSpan.dataset.href = closestLink.href;
            }
        }

        // Add mode-specific classes
        if (safeMode) {
            replacementSpan.classList.add('safe-mode');
        } else if (calmMode) {
            replacementSpan.classList.add('calm-mode');
        }

        // Add event listeners for revealing/hiding
        replacementSpan.addEventListener('click', async (event) => {
            event.stopPropagation(); // Prevent event bubbling
            // Always prevent default if it's a link-related blurred element
            if (replacementSpan.dataset.isLink === 'true') {
                event.preventDefault(); // Prevent link navigation
            }
            toggleCensoredContent(replacementSpan);
        });

        // Keep mousedown/mouseup for Calm Mode long-press reveal
        if (calmMode) {
            let pressTimer;
            replacementSpan.addEventListener('mousedown', (event) => {
                event.stopPropagation();
                if (replacementSpan.dataset.isLink === 'true') {
                    event.preventDefault(); // Prevent link navigation
                }
                if (!replacementSpan.classList.contains('revealed') && !replacementSpan.classList.contains('revealed-pending')) {
                    pressTimer = setTimeout(() => {
                        toggleCensoredContent(replacementSpan); // Reveal after long press
                    }, 700); // 700ms long press
                }
            });
            replacementSpan.addEventListener('mouseup', () => {
                clearTimeout(pressTimer);
            });
            replacementSpan.addEventListener('mouseleave', () => {
                clearTimeout(pressTimer);
            });
        }

        newNodes.push(replacementSpan);
        lastIndex = ickRegex.lastIndex;
    }

    // Add any remaining text after the last match
    if (lastIndex < originalContent.length) {
        newNodes.push(document.createTextNode(originalContent.substring(lastIndex)));
    }

    // If no matches found, or no new nodes were created (shouldn't happen if match found)
    if (censoredCount === 0 || newNodes.length === 0) {
        return false;
    }

    // Replace the original text node with the new nodes
    try {
        newNodes.forEach(newNode => parent.insertBefore(newNode, node));
        parent.removeChild(node);

        // Send message to background script for each unique word that was censored
        uniqueCensoredWords.forEach(word => {
            chrome.runtime.sendMessage({ action: "incrementIckCount", word: word })
                .catch(error => console.warn("Error sending incrementIckCount message (background script might not be active or ready):", error));
        });
        return true;
    } catch (e) {
        console.error("Error replacing node in censorTextNode:", e);
        return false;
    }
}

/**
 * Censors an image if its alt text or nearby text contains an ick word.
 * @param {HTMLImageElement} imgElement - The image element to process.
 * @returns {boolean} True if image was censored, false otherwise.
 */
function censorImage(imgElement) {
    if (!ickRegex || !imgElement || imgElement.classList.contains('ick-hidden-image') || imgElement.classList.contains('revealed-image')) {
        return false;
    }

    // Check alt text
    let textToCheck = imgElement.alt || '';

    // Check surrounding text (e.g., in a parent p tag, or a sibling text node)
    if (!textToCheck) {
        let parentText = imgElement.parentNode.textContent;
        // Limit the parentText to avoid excessive processing, e.g., 200 chars around the img
        const parentHtml = imgElement.parentNode.innerHTML;
        const imgIndex = parentHtml.indexOf(imgElement.outerHTML);
        if (imgIndex !== -1) {
            const before = parentHtml.substring(0, imgIndex);
            const after = parentHtml.substring(imgIndex + imgElement.outerHTML.length);
            textToCheck = (before.slice(-100) + ' ' + (imgElement.alt || '') + ' ' + after.slice(0, 100)).replace(/<[^>]*>/g, '').trim();
        } else {
            textToCheck = imgElement.alt || imgElement.parentNode.textContent || '';
        }
    }

    // If no text or no match, skip
    if (!textToCheck || !ickRegex.test(textToCheck)) {
        return false;
    }
    ickRegex.lastIndex = 0; // Reset regex for new test

    // If an ick word is found, blur the image
    imgElement.classList.add('ick-hidden-image');
    if (safeMode) {
        imgElement.classList.add('safe-mode-image');
    } else if (calmMode) {
        imgElement.classList.add('calm-mode-image');
    }
    imgElement.dataset.originalAlt = imgElement.alt || ''; // Store original alt
    imgElement.alt = "Ick content blurred"; // Change alt for accessibility

    // Attach click listener for revealing
    imgElement.addEventListener('click', async (event) => {
        event.stopPropagation();
        event.preventDefault(); // Prevent default image click behavior (e.g., opening in new tab)
        toggleCensoredContent(imgElement); // Centralized handling
    });

    // Handle long-press for calm mode images
    if (calmMode) {
        let pressTimer;
        imgElement.addEventListener('mousedown', (event) => {
            event.stopPropagation();
            event.preventDefault();
            if (!imgElement.classList.contains('revealed-image')) {
                pressTimer = setTimeout(() => {
                    toggleCensoredContent(imgElement); // Reveal after long press
                }, 700); // 700ms long press
            }
        });
        imgElement.addEventListener('mouseup', () => {
            clearTimeout(pressTimer);
        });
        imgElement.addEventListener('mouseleave', () => {
            clearTimeout(pressTimer);
        });
    }
    return true;
}


/**
 * Toggles the visibility of a censored content element (text span or image).
 * If revealed, it re-hides; if hidden, it reveals.
 * @param {HTMLElement} element - The HTML element containing the censored content.
 */
async function toggleCensoredContent(element) {
    clearCountdown(element); // Ensure any active countdown on this element is cleared

    const isImage = element.tagName === 'IMG';
    const revealedClass = isImage ? 'revealed-image' : 'revealed';
    const hiddenClass = isImage ? 'ick-hidden-image' : 'ick-hidden';
    const safeModeClass = isImage ? 'safe-mode-image' : 'safe-mode';
    const calmModeClass = isImage ? 'calm-mode-image' : 'calm-mode';

    const originalContent = isImage ? element.dataset.originalAlt : element.dataset.originalText;
    const isLink = element.dataset.isLink === 'true'; // Check if it was a link that was blurred
    const linkHref = element.dataset.href;

    if (element.classList.contains(revealedClass)) {
        // Currently revealed, so hide it
        element.classList.remove(revealedClass);
        element.classList.add(hiddenClass); // Re-apply hiding class

        if (safeMode) {
            element.classList.add(safeModeClass);
        } else if (calmMode) {
            element.classList.add(calmModeClass);
        }

        if (isImage) {
            element.alt = "Ick content blurred"; // Restore blurred alt text
        } else {
            element.textContent = originalContent; // Restore original text content
        }
        console.log(`Re-hid "${originalContent}".`);
    } else {
        // Currently hidden, so determine reveal logic based on mode
        let shouldReveal = true; // Assume reveal by default
        let revealConfirmationRequired = false;
        let linkConfirmationRequired = false;

        if (safeMode) {
            if (isLink) {
                // In Safe Mode, if it's a link, offer link navigation confirmation
                linkConfirmationRequired = true;
            } else {
                // In Safe Mode, if it's not a link, offer reveal confirmation
                revealConfirmationRequired = true;
            }
        } else if (calmMode) {
            // In Calm Mode, if it's a link, still offer confirmation before navigation
            if (isLink) {
                 linkConfirmationRequired = true;
            } else {
                // Calm Mode for non-links: initiate countdown or immediate reveal if already pending
                if (element.classList.contains('revealed-pending')) {
                    // If already counting down, immediately reveal
                    clearCountdown(element); // Clears countdown and removes revealed-pending
                    shouldReveal = true;
                } else {
                    // Start new countdown for Calm Mode
                    shouldReveal = false; // Don't reveal yet, start countdown
                    element.classList.add('revealed-pending');
                    element.dataset.hasCountdownOverlay = 'true'; // Flag to indicate overlay is for this element

                    if (!countdownOverlayElement) {
                        countdownOverlayElement = document.createElement('div');
                        countdownOverlayElement.className = 'countdown-overlay';
                        document.body.appendChild(countdownOverlayElement);
                    }

                    // Position the overlay ABOVE the current span
                    const rect = element.getBoundingClientRect();
                    countdownOverlayElement.style.top = `${window.scrollY + rect.top}px`; // Top of the word
                    countdownOverlayElement.style.left = `${window.scrollX + rect.left + rect.width / 2}px`; // Center horizontally
                    countdownOverlayElement.textContent = "Revealing in 3...";
                    countdownOverlayElement.classList.add('show');

                    let count = 3;
                    const countdownInterval = setInterval(() => {
                        count--;
                        if (count > 0) {
                            countdownOverlayElement.textContent = `Revealing in ${count}...`;
                        } else {
                            clearCountdown(element); // Clear interval and pending state
                            toggleCensoredContent(element); // Trigger reveal again (will now hit 'shouldReveal = true' path)
                        }
                    }, 1000);
                    countdownIntervals.set(element, countdownInterval);
                }
            }
        }


        // Handle confirmations
        if (revealConfirmationRequired) {
            const confirmed = await showIckModal(
                `This ${isImage ? 'image' : 'content'} is hidden for your safety. Are you sure you want to reveal it?`,
                `Reveal ${isImage ? 'Image' : ''}`,
                "Cancel",
                false // Not a link confirmation
            );
            shouldReveal = confirmed;
        } else if (linkConfirmationRequired) {
            const result = await showIckModal(
                `Content revealed. Do you want to go to the link?`,
                "Go to Link",
                "No, stay here",
                true, // This IS a link confirmation
                linkHref
            );
            if (result === 'link') {
                window.open(linkHref, '_blank'); // Open in new tab
                shouldReveal = true; // Still reveal the word on the current page
            } else {
                shouldReveal = false; // User chose not to go to link, so don't reveal (keep hidden)
            }
        }

        if (shouldReveal) {
            element.classList.add(revealedClass);
            element.classList.remove(hiddenClass, safeModeClass, calmModeClass, 'revealed-pending'); // Remove all hiding/pending classes

            if (isImage) {
                element.alt = originalContent; // Restore original alt text
            } else {
                element.textContent = originalContent; // Ensure original text is displayed
            }
            console.log(`Revealed "${originalContent}".`);

            // Update reveal stats (only when revealing)
            try {
                const settings = await loadSettings();
                settings.revealStats = settings.revealStats || {}; // Ensure revealStats exists
                settings.revealStats[originalContent] = (settings.revealStats[originalContent] || 0) + 1;
                await saveSettings({ revealStats: settings.revealStats });
                console.log(`Revealed "${originalContent}". Count: ${settings.revealStats[originalContent]}`);
            } catch (error) {
                console.error("Error updating reveal stats:", error);
            }
        } else {
            // If user cancelled a reveal (e.g., in Safe Mode), ensure it stays hidden
            // No need to do anything as it's not revealed yet
            showContentToast("Reveal cancelled.", "info");
        }
    }
    updateFloatingButtonsVisibility(); // Update button visibility after toggle
}


/**
 * Processes a single DOM element and its children for censoring.
 * @param {HTMLElement} element - The element to start processing from.
 */
function processElement(element) {
    if (element.nodeType === Node.TEXT_NODE) {
        censorTextNode(element);
    } else if (element.nodeType === Node.ELEMENT_NODE && element.hasChildNodes()) {
        // Create a static array of child nodes to avoid issues during modification
        const childNodes = Array.from(element.childNodes);
        for (const child of childNodes) {
            // Skip processing for script, style, and our own injected elements
            const tag = child.nodeType === Node.ELEMENT_NODE ? child.nodeName.toUpperCase() : ''; // Ensure uppercase for comparison
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'SVG' || tag === 'CANVAS' || tag === 'VIDEO' || tag === 'AUDIO' || tag === 'IFRAME') {
                continue;
            }
            // Skip our own injected elements by class/ID
            if (child.nodeType === Node.ELEMENT_NODE && (child.id === 'ick-reveal-all-btn' || child.id === 'ick-hide-all-btn' || child.classList.contains('content-toast') || child.classList.contains('countdown-overlay') || child.classList.contains('ick-modal'))) {
                continue;
            }
            // Skip if the child or its parent is already an ick-hidden/revealed element
            if (child.nodeType === Node.ELEMENT_NODE && (child.classList.contains('ick-hidden') || child.classList.contains('revealed') || child.classList.contains('ick-hidden-image') || child.classList.contains('revealed-image'))) {
                continue;
            }

            // Process images
            if (tag === 'IMG') {
                censorImage(child);
            } else {
                processElement(child);
            }
        }
    }
}


/**
 * Re-applies censoring to all elements.
 * Useful after settings change or a full page reload.
 */
function reapplyCensoring() {
    console.log("Reapplying censoring across the document.");
    stopObserving(); // Stop observer to avoid infinite loops during full re-scan

    // Clear any active countdowns and remove overlay if present
    countdownIntervals.forEach((intervalId, element) => {
        clearInterval(intervalId);
        countdownIntervals.delete(element);
        delete element.dataset.countdown;
        element.classList.remove('revealed-pending');
    });
    countdownIntervals.clear();
    if (countdownOverlayElement) {
        countdownOverlayElement.classList.remove('show');
        countdownOverlayElement.remove();
        countdownOverlayElement = null;
    }

    // Un-censor any existing ick-hidden, revealed spans, or images before re-processing
    // Select all ick-related elements, then restore their original state
    document.querySelectorAll('.ick-hidden, .revealed, .ick-hidden-image, .revealed-image').forEach(element => {
        const isImage = element.tagName === 'IMG';
        if (isImage) {
            element.classList.remove('ick-hidden-image', 'revealed-image', 'safe-mode-image', 'calm-mode-image');
            element.alt = element.dataset.originalAlt || ''; // Restore original alt
            delete element.dataset.originalAlt;
        } else {
            // For text spans, replace the span with its original text node
            const originalText = element.dataset.originalText || element.textContent;
            const textNode = document.createTextNode(originalText);
            if (element.parentNode) {
                element.parentNode.replaceChild(textNode, element);
            }
        }
    });

    processElement(document.body);
    startObserving(); // Restart observer
    updateFloatingButtonsVisibility(); // Update button visibility after re-censor
}

/**
 * Callback function for the MutationObserver.
 * Processes newly added nodes and character data changes for censoring.
 * @param {Array<MutationRecord>} mutationsList - List of mutations.
 */
function handleMutations(mutationsList) {
    let contentChanged = false;
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
                // Skip processing for script, style, and our own injected elements
                const tag = node.nodeType === Node.ELEMENT_NODE ? node.nodeName.toUpperCase() : '';
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'SVG' || tag === 'CANVAS' || tag === 'VIDEO' || tag === 'AUDIO' || tag === 'IFRAME') {
                    continue;
                }
                // Skip our own injected elements by class/ID
                if (node.nodeType === Node.ELEMENT_NODE && (node.id === 'ick-reveal-all-btn' || node.id === 'ick-hide-all-btn' || node.classList.contains('content-toast') || node.classList.contains('countdown-overlay') || node.classList.contains('ick-modal'))) {
                    continue;
                }
                // Skip if the child or its parent is already an ick-hidden/revealed element
                if (node.nodeType === Node.ELEMENT_NODE && (node.classList.contains('ick-hidden') || node.classList.contains('revealed') || node.classList.contains('ick-hidden-image') || node.classList.contains('revealed-image'))) {
                    continue;
                }

                if (processElement(node)) {
                    contentChanged = true;
                }
            }
        } else if (mutation.type === 'characterData') {
            if (mutation.target.nodeType === Node.TEXT_NODE && mutation.target.parentNode && !(mutation.target.parentNode.classList.contains('ick-hidden') || mutation.target.parentNode.classList.contains('revealed') || mutation.target.parentNode.classList.contains('reveal-all-btn') || mutation.target.parentNode.classList.contains('hide-all-btn') || mutation.target.parentNode.classList.contains('content-toast') || mutation.target.parentNode.classList.contains('countdown-overlay') || mutation.target.parentNode.classList.contains('ick-modal'))) {
                if (censorTextNode(mutation.target)) {
                    contentChanged = true;
                }
            }
        }
    }
    if (contentChanged) {
        updateFloatingButtonsVisibility();
    }
}

/**
 * Starts the MutationObserver to monitor DOM changes.
 */
function startObserving() {
    if (observer) {
        observer.disconnect(); // Ensure previous observer is disconnected
    }
    observer = new MutationObserver(handleMutations);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['alt'] }); // Observe alt attribute changes
    console.log("MutationObserver started.");
}

/**
 * Stops the MutationObserver.
 */
function stopObserving() {
    if (observer) {
        observer.disconnect();
        console.log("MutationObserver stopped.");
    }
}

/**
 * Reveals all currently hidden Ick words/images on the page.
 */
function revealAllContent() {
    // Collect all hidden elements first
    const hiddenElements = document.querySelectorAll('.ick-hidden, .ick-hidden-image');

    hiddenElements.forEach(element => {
        clearCountdown(element); // Ensure any countdown is cleared
        // Directly apply revealed classes without modal logic for 'Reveal All' action
        const isImage = element.tagName === 'IMG';
        const revealedClass = isImage ? 'revealed-image' : 'revealed';
        const hiddenClass = isImage ? 'ick-hidden-image' : 'ick-hidden';
        const safeModeClass = isImage ? 'safe-mode-image' : 'safe-mode';
        const calmModeClass = isImage ? 'calm-mode-image' : 'calm-mode';

        const originalContent = isImage ? element.dataset.originalAlt : element.dataset.originalText;

        element.classList.add(revealedClass);
        element.classList.remove(hiddenClass, safeModeClass, calmModeClass, 'revealed-pending');

        if (isImage) {
            element.alt = originalContent;
        } else {
            element.textContent = originalContent;
        }
        console.log(`Revealed "${originalContent}" (via Reveal All).`);

        // Update reveal stats
        loadSettings().then(settings => {
            settings.revealStats = settings.revealStats || {};
            settings.revealStats[originalContent] = (settings.revealStats[originalContent] || 0) + 1;
            saveSettings({ revealStats: settings.revealStats }).catch(error => console.error("Error updating reveal stats:", error));
        }).catch(error => console.error("Error loading settings for reveal stats:", error));
    });

    if (hiddenElements.length > 0) {
        showContentToast("All Ick content revealed.", "info");
    } else {
        showContentToast("No Ick content to reveal.", "info");
    }
    updateFloatingButtonsVisibility();
    console.log("All Ick content revealed.");
}

/**
 * Hides all currently revealed Ick words/images on the page.
 */
function hideAllContent() {
    const revealedElements = document.querySelectorAll('.revealed, .revealed-image');
    revealedElements.forEach(element => {
        clearCountdown(element); // Ensure any countdown is cleared

        const isImage = element.tagName === 'IMG';
        const revealedClass = isImage ? 'revealed-image' : 'revealed';
        const hiddenClass = isImage ? 'ick-hidden-image' : 'ick-hidden';
        const safeModeClass = isImage ? 'safe-mode-image' : 'safe-mode';
        const calmModeClass = isImage ? 'calm-mode-image' : 'calm-mode';

        // Re-apply hiding classes
        element.classList.remove(revealedClass);
        element.classList.add(hiddenClass);

        if (safeMode) {
            element.classList.add(safeModeClass);
        } else if (calmMode) {
            element.classList.add(calmModeClass);
        }

        if (isImage) {
            element.alt = "Ick content blurred"; // Restore blurred alt text
        } else {
            // Restore original text content for re-blurring via CSS
            element.textContent = element.dataset.originalText || element.textContent;
        }
        console.log(`Re-hid "${element.dataset.originalText || element.alt}" (via Hide All).`);
    });

    if (revealedElements.length > 0) {
        showContentToast("All Ick content hidden.", "info");
    } else {
        showContentToast("No Ick content to hide.", "info");
    }
    updateFloatingButtonsVisibility();
    console.log("All Ick content hidden.");
}

/**
 * Creates and appends the floating reveal/hide all buttons to the body.
 */
function createFloatingButtons() {
    if (!revealAllButton) {
        revealAllButton = document.createElement('button');
        revealAllButton.id = 'ick-reveal-all-btn';
        revealAllButton.textContent = 'Reveal All';
        revealAllButton.className = 'ick-floating-btn reveal-all-button';
        revealAllButton.style.display = 'none'; // Initially hidden
        revealAllButton.addEventListener('click', revealAllContent);
        document.body.appendChild(revealAllButton);
        console.log("Reveal All button created.");
    }

    if (!hideAllButton) {
        hideAllButton = document.createElement('button');
        hideAllButton.id = 'ick-hide-all-btn';
        hideAllButton.textContent = 'Hide All';
        hideAllButton.className = 'ick-floating-btn hide-all-button';
        hideAllButton.style.display = 'none'; // Initially hidden
        hideAllButton.addEventListener('click', hideAllContent);
        document.body.appendChild(hideAllButton);
        console.log("Hide All button created.");
    }
}

/**
 * Updates the visibility of the floating reveal/hide all buttons.
 */
function updateFloatingButtonsVisibility() {
    if (!revealAllButton || !hideAllButton) {
        // Buttons not yet created, defer update
        return;
    }

    const hiddenElementsCount = document.querySelectorAll('.ick-hidden, .ick-hidden-image').length;
    const revealedElementsCount = document.querySelectorAll('.revealed, .revealed-image').length;

    if (hiddenElementsCount > 0) {
        revealAllButton.style.display = 'block';
    } else {
        revealAllButton.style.display = 'none';
    }

    if (revealedElementsCount > 0) {
        hideAllButton.style.display = 'block';
    } else {
        hideAllButton.style.display = 'none';
    }
    console.log(`Hidden elements: ${hiddenElementsCount}, Revealed elements: ${revealedElementsCount}. Buttons updated.`);
}

/**
 * Initializes the content script: loads settings, applies censoring, and sets up observer.
 */
async function initializeContentScript() {
    console.log("Initializing content script...");
    try {
        const settings = await loadSettings(); // From utils.js
        ickWords = settings.ickWords || DEFAULT_SETTINGS.ickWords; // From utils.js
        safeMode = settings.safeMode;
        calmMode = settings.calmMode;
        ickRegex = createIckRegex(ickWords);

        console.log("Current settings:", { ickWords, safeMode, calmMode });

        // Ensure buttons are created before processing content
        createFloatingButtons();

        // Initial scan of the document
        reapplyCensoring(); // This will perform initial censoring and restart observer

        // Listen for messages from background script or popup for settings changes
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === "settingsUpdated") {
                console.log("Settings updated message received in content script.");
                initializeContentScript(); // Re-initialize to apply new settings
            }
            // For general messages that might need a response
            if (message.action === "checkContentScriptStatus") {
                 sendResponse({ status: "ready", url: window.location.href, hasIckElements: document.querySelectorAll('.ick-hidden, .ick-hidden-image').length > 0 });
                 return true; // Indicate that sendResponse will be called asynchronously
             }
        });

        // Add a listener to handle URL changes for SPA (Single Page Application) sites
        // This is a common pattern for SPAs where the URL changes but the page doesn't fully reload.
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                console.log("URL changed, re-applying censoring for SPA.");
                reapplyCensoring(); // Re-censor the new content
            }
        }).observe(document, { subtree: true, childList: true });


    } catch (error) {
        console.error("Error initializing content script:", error);
        showContentToast("Error loading settings or applying censoring.", "error");
    }
}

// Initial call to start the content script when the document is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
    initializeContentScript();
}