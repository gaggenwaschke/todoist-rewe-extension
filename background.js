// Background script for Todoist REWE Integration
class TodoistReweExtension {
    constructor() {
        this.todoistApiUrl = 'https://api.todoist.com/rest/v2';
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Handle extension installation
        chrome.runtime.onInstalled.addListener(() => {
            console.log('Todoist REWE Extension installed');
        });

        // Handle extension icon click
        chrome.action.onClicked.addListener(() => {
            this.openExtensionTab();
        });

        // Handle messages from popup and content scripts
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep the message channel open for async responses
        });

        // Handle OAuth token refresh
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'refreshToken') {
                this.refreshTodoistToken();
            }
        });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'authenticateTodoist':
                    const authResult = await this.authenticateTodoist();
                    sendResponse(authResult);
                    break;

                case 'getTodoistProjects':
                    const projects = await this.getTodoistProjects();
                    sendResponse(projects);
                    break;

                case 'getTodoistTasks':
                    const tasks = await this.getTodoistTasks(message.projectId, message.sectionId);
                    sendResponse(tasks);
                    break;

                case 'getFilteredTasks':
                    const filteredTasks = await this.getFilteredTasks(message.projectId, message.sectionId, message.tag);
                    sendResponse(filteredTasks);
                    break;

                case 'startInteractiveTransfer':
                    const startResult = await this.startInteractiveTransfer(message.tasks);
                    sendResponse(startResult);
                    break;

                case 'getCurrentTask':
                    const currentTask = await this.getCurrentTask();
                    sendResponse(currentTask);
                    break;

                case 'searchReweProducts':
                    const searchResults = await this.searchReweProducts(message.searchTerm);
                    sendResponse(searchResults);
                    break;

                case 'selectProduct':
                    const selectResult = await this.selectProduct(message.productUrl);
                    sendResponse(selectResult);
                    break;

                case 'skipCurrentTask':
                    const skipResult = await this.skipCurrentTask();
                    sendResponse(skipResult);
                    break;

                case 'refineSearch':
                    const refineResult = await this.refineSearch(message.originalTerm, message.refinedTerm);
                    sendResponse(refineResult);
                    break;

                case 'moveToNextTask':
                    const moveResult = await this.moveToNextTask();
                    sendResponse(moveResult);
                    break;

                case 'getTransferSummary':
                    const summary = await this.getTransferSummary();
                    sendResponse(summary);
                    break;

                case 'completeTasksInTodoist':
                    const completeResult = await this.completeTasksInTodoist(message.taskIds);
                    sendResponse(completeResult);
                    break;

                case 'saveProductMapping':
                    await this.saveProductMapping(message.taskName, message.reweProduct);
                    sendResponse({ success: true });
                    break;

                case 'getProductMapping':
                    const mapping = await this.getProductMapping(message.taskName);
                    sendResponse(mapping);
                    break;

                default:
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Background script error:', error);
            sendResponse({ error: error.message });
        }
    }

    async authenticateTodoist() {
        try {
            // Get API token from settings
            const settings = await this.getExtensionSettings();
            const apiToken = settings.apiToken;

            if (!apiToken) {
                throw new Error('Please configure your Todoist API token in the extension settings');
            }

            // Store the token for use in API calls
            await chrome.storage.local.set({
                todoistToken: apiToken
            });

            // Validate the token by making a test API call
            if (await this.validateToken(apiToken)) {
                return { success: true, token: apiToken };
            } else {
                throw new Error('Invalid API token. Please check your Todoist API token in settings.');
            }
        } catch (error) {
            console.error('Todoist authentication error:', error);
            return { success: false, error: error.message };
        }
    }

    async getStoredToken() {
        const result = await chrome.storage.local.get(['todoistToken']);
        return result.todoistToken;
    }

    async validateToken(token) {
        try {
            const response = await fetch(`${this.todoistApiUrl}/projects`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async getTodoistProjects() {
        const token = await this.getStoredToken();
        if (!token) {
            throw new Error('No authentication token found');
        }

        const response = await fetch(`${this.todoistApiUrl}/projects`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch projects');
        }

        return await response.json();
    }

    async getTodoistTasks(projectId, sectionId = null) {
        const token = await this.getStoredToken();
        if (!token) {
            throw new Error('No authentication token found');
        }

        let url = `${this.todoistApiUrl}/tasks?project_id=${projectId}`;
        if (sectionId) {
            url += `&section_id=${sectionId}`;
        }

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch tasks');
        }

        return await response.json();
    }

    async getFilteredTasks(projectId, sectionId, tag) {
        const tasks = await this.getTodoistTasks(projectId, sectionId);

        if (!tag) {
            return tasks;
        }

        // Normalize the tag (remove @ if present and convert to lowercase)
        const normalizedTag = tag.replace(/^@/, '').toLowerCase();

        return tasks.filter(task => {
            if (!task.labels || task.labels.length === 0) {
                return false;
            }

            // Check if any of the task's labels match our tag
            return task.labels.some(label => {
                const normalizedLabel = label.replace(/^@/, '').toLowerCase();
                return normalizedLabel === normalizedTag ||
                    normalizedLabel.includes(normalizedTag) ||
                    normalizedTag.includes(normalizedLabel);
            });
        });
    }

    async startInteractiveTransfer(tasks) {
        try {
            // Initialize interactive transfer state
            await chrome.storage.local.set({
                interactiveTransfer: {
                    tasks: tasks,
                    currentIndex: 0,
                    completed: [],
                    skipped: [],
                    refined: {}
                }
            });

            return {
                success: true,
                totalTasks: tasks.length,
                currentIndex: 0
            };
        } catch (error) {
            console.error('Failed to start interactive transfer:', error);
            return { success: false, error: error.message };
        }
    }

    async getCurrentTask() {
        try {
            const result = await chrome.storage.local.get(['interactiveTransfer']);
            const transfer = result.interactiveTransfer;

            if (!transfer || transfer.currentIndex >= transfer.tasks.length) {
                return { success: false, completed: true };
            }

            const currentTask = transfer.tasks[transfer.currentIndex];
            const taskName = currentTask.content || currentTask.name;

            // Check if we have a refined search term for this task
            const refinedTerm = transfer.refined[taskName] || this.sanitizeSearchTerm(taskName);

            return {
                success: true,
                task: currentTask,
                taskName: taskName,
                searchTerm: refinedTerm,
                currentIndex: transfer.currentIndex,
                totalTasks: transfer.tasks.length,
                completed: false
            };
        } catch (error) {
            console.error('Failed to get current task:', error);
            return { success: false, error: error.message };
        }
    }

    async searchReweProducts(searchTerm) {
        try {
            // Get settings for max results
            const settings = await this.getExtensionSettings();
            const maxResults = settings.maxSearchResults || 5;

            // Create search URL
            const searchUrl = `https://shop.rewe.de/productList?search=${encodeURIComponent(searchTerm)}`;

            // Try to find an existing REWE tab first
            let reweTabs = await chrome.tabs.query({ url: "https://shop.rewe.de/*" });
            let targetTab = null;

            if (reweTabs.length > 0) {
                // Use existing REWE tab
                targetTab = reweTabs[0];
                // Navigate to search URL
                await chrome.tabs.update(targetTab.id, { url: searchUrl });
            } else {
                // Create new tab in background
                targetTab = await chrome.tabs.create({
                    url: searchUrl,
                    active: false
                });
            }

            // Wait for page to load
            await this.waitForTabReady(targetTab.id);

            // Add extra wait for dynamic content
            await this.delay(2000);

            // Get search results from content script
            const results = await chrome.tabs.sendMessage(targetTab.id, {
                action: 'getSearchResults',
                maxResults: maxResults
            });

            // Close the tab only if we created it
            if (reweTabs.length === 0) {
                await chrome.tabs.remove(targetTab.id);
            }

            // If results failed, try a simpler approach
            if (!results || !results.success) {
                return this.createFallbackResults(searchTerm, searchUrl, maxResults);
            }

            return results;
        } catch (error) {
            console.error('Search error:', error);
            // Return fallback results instead of failing
            return this.createFallbackResults(searchTerm, `https://shop.rewe.de/productList?search=${encodeURIComponent(searchTerm)}`, 5);
        }
    }

    createFallbackResults(searchTerm, searchUrl, maxResults) {
        // Create fallback results that will guide users to search manually
        const fallbackProducts = [];

        for (let i = 1; i <= Math.min(maxResults, 3); i++) {
            fallbackProducts.push({
                id: `fallback-${i}`,
                name: `Search for "${searchTerm}" on REWE`,
                price: 'Click to search',
                image: null,
                link: searchUrl,
                similarity: 0.8,
                fallback: true
            });
        }

        return {
            success: true,
            products: fallbackProducts,
            query: searchTerm,
            fallback: true
        };
    }

    async selectProduct(productUrl) {
        try {
            // Open the selected product in a new tab
            await chrome.tabs.create({
                url: productUrl,
                active: true
            });

            // Move to next task
            await this.moveToNextTask();

            return { success: true };
        } catch (error) {
            console.error('Failed to select product:', error);
            return { success: false, error: error.message };
        }
    }

    async skipCurrentTask() {
        try {
            const result = await chrome.storage.local.get(['interactiveTransfer']);
            const transfer = result.interactiveTransfer;

            if (!transfer) {
                return { success: false, error: 'No active transfer' };
            }

            // Add to skipped list (don't add to completed!)
            transfer.skipped.push(transfer.tasks[transfer.currentIndex]);

            // Just move to next index without marking as completed
            transfer.currentIndex++;
            await chrome.storage.local.set({ interactiveTransfer: transfer });

            return { success: true };
        } catch (error) {
            console.error('Failed to skip task:', error);
            return { success: false, error: error.message };
        }
    }

    async refineSearch(originalTerm, refinedTerm) {
        try {
            const result = await chrome.storage.local.get(['interactiveTransfer']);
            const transfer = result.interactiveTransfer;

            if (!transfer) {
                return { success: false, error: 'No active transfer' };
            }

            // Save refined search term
            transfer.refined[originalTerm] = refinedTerm;

            await chrome.storage.local.set({ interactiveTransfer: transfer });

            return { success: true };
        } catch (error) {
            console.error('Failed to refine search:', error);
            return { success: false, error: error.message };
        }
    }

    async moveToNextTask() {
        try {
            const result = await chrome.storage.local.get(['interactiveTransfer']);
            const transfer = result.interactiveTransfer;

            if (!transfer) {
                return { success: false, error: 'No active transfer' };
            }

            // Mark current task as completed
            const currentTask = transfer.tasks[transfer.currentIndex];
            transfer.completed.push(currentTask);

            transfer.currentIndex++;
            await chrome.storage.local.set({ interactiveTransfer: transfer });

            return { success: true };
        } catch (error) {
            console.error('Failed to move to next task:', error);
            return { success: false, error: error.message };
        }
    }

    async completeTasksInTodoist(taskIds) {
        try {
            const token = await this.getStoredToken();
            if (!token) {
                throw new Error('No authentication token found');
            }

            const results = {
                completed: [],
                failed: []
            };

            for (const taskId of taskIds) {
                try {
                    const response = await fetch(`${this.todoistApiUrl}/tasks/${taskId}/close`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (response.ok) {
                        results.completed.push(taskId);
                    } else {
                        results.failed.push({ taskId, error: `HTTP ${response.status}` });
                    }
                } catch (error) {
                    results.failed.push({ taskId, error: error.message });
                }

                // Small delay between requests to avoid rate limiting
                await this.delay(200);
            }

            return {
                success: true,
                results: results
            };
        } catch (error) {
            console.error('Failed to complete tasks in Todoist:', error);
            return { success: false, error: error.message };
        }
    }

    async getTransferSummary() {
        try {
            const result = await chrome.storage.local.get(['interactiveTransfer']);
            const transfer = result.interactiveTransfer;

            if (!transfer) {
                return { success: false, error: 'No transfer data' };
            }

            return {
                success: true,
                totalTasks: transfer.tasks.length,
                completed: transfer.completed.length,
                skipped: transfer.skipped.length,
                refined: Object.keys(transfer.refined).length,
                completedTasks: transfer.completed || []
            };
        } catch (error) {
            console.error('Failed to get transfer summary:', error);
            return { success: false, error: error.message };
        }
    }

    sanitizeSearchTerm(taskName) {
        // Remove quantity indicators (numbers at the beginning)
        let sanitized = taskName
            // Remove leading numbers with units (e.g., "2x", "3 kg", "5 pieces")
            .replace(/^\d+\s*(x|kg|g|l|ml|pieces?|pcs?|stück|stk)?\s*/i, '')
            // Remove numbers in parentheses (e.g., "(2)")
            .replace(/\(\d+\)/g, '')
            // Remove standalone numbers at the beginning
            .replace(/^\d+\s+/, '')
            // Remove extra whitespace
            .trim();

        // If nothing is left, try to extract meaningful words
        if (!sanitized) {
            // Take the original and remove only leading numbers
            sanitized = taskName.replace(/^\d+\s*/, '').trim();
        }

        return sanitized;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async waitForTabReady(tabId) {
        return new Promise((resolve) => {
            const checkTab = () => {
                chrome.tabs.get(tabId, (tab) => {
                    if (tab.status === 'complete') {
                        resolve();
                    } else {
                        setTimeout(checkTab, 100);
                    }
                });
            };
            checkTab();
        });
    }

    async saveProductMapping(taskName, reweProduct) {
        const mappings = await chrome.storage.local.get(['productMappings']) || {};
        const currentMappings = mappings.productMappings || {};

        currentMappings[taskName.toLowerCase()] = reweProduct;

        await chrome.storage.local.set({
            productMappings: currentMappings
        });
    }

    async getProductMapping(taskName) {
        const mappings = await chrome.storage.local.get(['productMappings']);
        const currentMappings = mappings.productMappings || {};

        return currentMappings[taskName.toLowerCase()] || null;
    }

    async getExtensionSettings() {
        const result = await chrome.storage.sync.get(['extensionSettings']);
        return result.extensionSettings || {};
    }

    async openExtensionTab() {
        try {
            // Check if extension tab is already open
            const extensionUrl = chrome.runtime.getURL('popup/popup.html');
            const existingTabs = await chrome.tabs.query({ url: extensionUrl });

            if (existingTabs.length > 0) {
                // Focus existing tab
                await chrome.tabs.update(existingTabs[0].id, { active: true });
                await chrome.windows.update(existingTabs[0].windowId, { focused: true });
            } else {
                // Create new tab
                await chrome.tabs.create({
                    url: extensionUrl,
                    active: true
                });
            }
        } catch (error) {
            console.error('Failed to open extension tab:', error);
        }
    }

    async refreshTodoistToken() {
        // Implement token refresh logic if needed
        console.log('Token refresh not implemented yet');
    }
}

// Initialize the extension
const extension = new TodoistReweExtension();
