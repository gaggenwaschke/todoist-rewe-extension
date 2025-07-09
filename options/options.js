// Options script for Todoist REWE Integration
class TodoistReweOptions {
    constructor() {
        this.defaultSettings = {
            similarityThreshold: 0.7,
            maxSearchResults: 5,
            fuzzyMatching: true,
            autoOpenCart: true,
            showNotifications: true,
            defaultTag: '',
            apiToken: ''
        };

        this.currentSettings = { ...this.defaultSettings };
        this.saveTimeout = null;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadSettings();
        await this.checkAuthStatus();
        await this.loadMappingsCount();
    }

    setupEventListeners() {
        // Authentication
        document.getElementById('auth-button').addEventListener('click', () => this.handleAuth());
        document.getElementById('disconnect-button').addEventListener('click', () => this.handleDisconnect());

        // Settings inputs
        document.getElementById('similarity-threshold').addEventListener('input', (e) => {
            this.updateSimilarityValue(e.target.value);
            this.currentSettings.similarityThreshold = parseFloat(e.target.value);
            this.saveSettings();
        });

        document.getElementById('max-search-results').addEventListener('input', (e) => {
            this.currentSettings.maxSearchResults = parseInt(e.target.value);
            this.saveSettings();
        });

        document.getElementById('fuzzy-matching').addEventListener('change', (e) => {
            this.currentSettings.fuzzyMatching = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('auto-open-cart').addEventListener('change', (e) => {
            this.currentSettings.autoOpenCart = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('show-notifications').addEventListener('change', (e) => {
            this.currentSettings.showNotifications = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('default-tag').addEventListener('input', (e) => {
            this.currentSettings.defaultTag = e.target.value.trim();
            this.saveSettings();
        });

        // API token
        document.getElementById('api-token').addEventListener('input', (e) => {
            this.currentSettings.apiToken = e.target.value.trim();
            this.saveSettings();
        });

        // Data management
        document.getElementById('view-mappings').addEventListener('click', () => this.viewMappings());
        document.getElementById('clear-mappings').addEventListener('click', () => this.clearMappings());
        document.getElementById('export-settings').addEventListener('click', () => this.exportSettings());
        document.getElementById('import-settings').addEventListener('click', () => this.importSettings());

        // Footer actions
        document.getElementById('save-settings').addEventListener('click', () => this.saveSettings(true));
        document.getElementById('reset-settings').addEventListener('click', () => this.resetSettings());

        // Modal controls
        document.getElementById('close-mappings-modal').addEventListener('click', () => this.closeMappingsModal());
        document.getElementById('close-mappings').addEventListener('click', () => this.closeMappingsModal());
        document.getElementById('modal-overlay').addEventListener('click', () => this.closeMappingsModal());

        // Import file input
        document.getElementById('import-file').addEventListener('change', (e) => this.handleImportFile(e));
    }

    async checkAuthStatus() {
        const authStatus = document.getElementById('auth-status');
        const authIndicator = document.getElementById('auth-indicator');
        const authText = document.getElementById('auth-text');
        const authButton = document.getElementById('auth-button');
        const disconnectButton = document.getElementById('disconnect-button');

        try {
            const response = await this.sendMessage({ action: 'authenticateTodoist' });

            if (response.success) {
                authStatus.classList.add('connected');
                authIndicator.textContent = '✅';
                authText.textContent = 'Connected to Todoist';
                authButton.classList.add('hidden');
                disconnectButton.classList.remove('hidden');
            } else {
                authStatus.classList.remove('connected');
                authIndicator.textContent = '⚠️';
                authText.textContent = 'Not connected';
                authButton.classList.remove('hidden');
                disconnectButton.classList.add('hidden');
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            authStatus.classList.remove('connected');
            authIndicator.textContent = '❌';
            authText.textContent = 'Connection error';
            authButton.classList.remove('hidden');
            disconnectButton.classList.add('hidden');
        }
    }

    async handleAuth() {
        const authButton = document.getElementById('auth-button');
        const originalText = authButton.textContent;

        authButton.textContent = 'Connecting...';
        authButton.disabled = true;

        try {
            const response = await this.sendMessage({ action: 'authenticateTodoist' });

            if (response.success) {
                await this.checkAuthStatus();
                this.showSaveStatus('Authentication successful!');
            } else {
                this.showError('Authentication failed: ' + (response.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Authentication error:', error);
            this.showError('Authentication failed: ' + error.message);
        } finally {
            authButton.textContent = originalText;
            authButton.disabled = false;
        }
    }

    async handleDisconnect() {
        if (!confirm('Are you sure you want to disconnect from Todoist? This will require re-authentication to use the extension.')) {
            return;
        }

        try {
            // Clear stored authentication data
            await chrome.storage.local.remove(['todoistToken', 'tokenExpiry']);
            await this.checkAuthStatus();
            this.showSaveStatus('Disconnected from Todoist');
        } catch (error) {
            console.error('Disconnect error:', error);
            this.showError('Failed to disconnect: ' + error.message);
        }
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['extensionSettings']);
            const savedSettings = result.extensionSettings || {};

            this.currentSettings = { ...this.defaultSettings, ...savedSettings };
            this.updateUI();
        } catch (error) {
            console.error('Failed to load settings:', error);
            this.currentSettings = { ...this.defaultSettings };
            this.updateUI();
        }
    }

    updateUI() {
        // Update similarity threshold
        const similaritySlider = document.getElementById('similarity-threshold');
        const similarityValue = document.getElementById('similarity-value');

        similaritySlider.value = this.currentSettings.similarityThreshold;
        this.updateSimilarityValue(this.currentSettings.similarityThreshold);

        // Update other inputs
        document.getElementById('max-search-results').value = this.currentSettings.maxSearchResults;
        document.getElementById('fuzzy-matching').checked = this.currentSettings.fuzzyMatching;
        document.getElementById('auto-open-cart').checked = this.currentSettings.autoOpenCart;
        document.getElementById('show-notifications').checked = this.currentSettings.showNotifications;
        document.getElementById('default-tag').value = this.currentSettings.defaultTag;

        // Update API token
        document.getElementById('api-token').value = this.currentSettings.apiToken;
    }

    updateSimilarityValue(value) {
        const similarityValue = document.getElementById('similarity-value');
        similarityValue.textContent = Math.round(value * 100) + '%';
    }

    async saveSettings(showFeedback = false) {
        // Debounce saves
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(async () => {
            try {
                await chrome.storage.sync.set({
                    extensionSettings: this.currentSettings
                });

                if (showFeedback) {
                    this.showSaveStatus('Settings saved successfully!');
                }
            } catch (error) {
                console.error('Failed to save settings:', error);
                this.showError('Failed to save settings: ' + error.message);
            }
        }, 300);
    }

    async resetSettings() {
        if (!confirm('Are you sure you want to reset all settings to their default values?')) {
            return;
        }

        try {
            this.currentSettings = { ...this.defaultSettings };
            await chrome.storage.sync.set({
                extensionSettings: this.currentSettings
            });

            this.updateUI();
            this.showSaveStatus('Settings reset to defaults');
        } catch (error) {
            console.error('Failed to reset settings:', error);
            this.showError('Failed to reset settings: ' + error.message);
        }
    }

    async loadMappingsCount() {
        try {
            const result = await chrome.storage.local.get(['productMappings']);
            const mappings = result.productMappings || {};
            const count = Object.keys(mappings).length;

            const mappingsCount = document.getElementById('mappings-count');
            mappingsCount.textContent = `${count} product mappings saved`;
        } catch (error) {
            console.error('Failed to load mappings count:', error);
            document.getElementById('mappings-count').textContent = 'Error loading mappings';
        }
    }

    async viewMappings() {
        const modal = document.getElementById('mappings-modal');
        const overlay = document.getElementById('modal-overlay');
        const mappingsList = document.getElementById('mappings-list');

        modal.classList.remove('hidden');
        overlay.classList.remove('hidden');
        mappingsList.innerHTML = '<div class="loading">Loading mappings...</div>';

        try {
            const result = await chrome.storage.local.get(['productMappings']);
            const mappings = result.productMappings || {};

            if (Object.keys(mappings).length === 0) {
                mappingsList.innerHTML = '<div class="loading">No product mappings found</div>';
                return;
            }

            mappingsList.innerHTML = '';

            Object.entries(mappings).forEach(([taskName, product]) => {
                const mappingItem = document.createElement('div');
                mappingItem.className = 'mapping-item';

                mappingItem.innerHTML = `
                    <div class="mapping-info">
                        <div class="mapping-task">${this.escapeHtml(taskName)}</div>
                        <div class="mapping-product">${this.escapeHtml(product.name)} - ${this.escapeHtml(product.price)}</div>
                    </div>
                    <div class="mapping-actions">
                        <button class="danger-button" onclick="todoistReweOptions.deleteMapping('${this.escapeHtml(taskName)}')">Delete</button>
                    </div>
                `;

                mappingsList.appendChild(mappingItem);
            });
        } catch (error) {
            console.error('Failed to load mappings:', error);
            mappingsList.innerHTML = '<div class="loading">Error loading mappings</div>';
        }
    }

    async deleteMapping(taskName) {
        if (!confirm(`Are you sure you want to delete the mapping for "${taskName}"?`)) {
            return;
        }

        try {
            const result = await chrome.storage.local.get(['productMappings']);
            const mappings = result.productMappings || {};

            delete mappings[taskName];

            await chrome.storage.local.set({
                productMappings: mappings
            });

            await this.viewMappings(); // Refresh the modal
            await this.loadMappingsCount(); // Update the count
            this.showSaveStatus('Mapping deleted successfully');
        } catch (error) {
            console.error('Failed to delete mapping:', error);
            this.showError('Failed to delete mapping: ' + error.message);
        }
    }

    async clearMappings() {
        if (!confirm('Are you sure you want to clear all product mappings? This action cannot be undone.')) {
            return;
        }

        try {
            await chrome.storage.local.set({
                productMappings: {}
            });

            await this.loadMappingsCount();
            this.showSaveStatus('All product mappings cleared');
        } catch (error) {
            console.error('Failed to clear mappings:', error);
            this.showError('Failed to clear mappings: ' + error.message);
        }
    }

    closeMappingsModal() {
        document.getElementById('mappings-modal').classList.add('hidden');
        document.getElementById('modal-overlay').classList.add('hidden');
    }

    async exportSettings() {
        try {
            const settingsData = await chrome.storage.sync.get(['extensionSettings']);
            const mappingsData = await chrome.storage.local.get(['productMappings']);

            const exportData = {
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                settings: settingsData.extensionSettings || this.defaultSettings,
                mappings: mappingsData.productMappings || {}
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `todoist-rewe-settings-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showSaveStatus('Settings exported successfully!');
        } catch (error) {
            console.error('Export failed:', error);
            this.showError('Export failed: ' + error.message);
        }
    }

    importSettings() {
        document.getElementById('import-file').click();
    }

    async handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const importData = JSON.parse(text);

            // Validate import data
            if (!importData.version || !importData.settings) {
                throw new Error('Invalid import file format');
            }

            // Confirm import
            if (!confirm('Are you sure you want to import these settings? This will overwrite your current configuration.')) {
                return;
            }

            // Import settings
            if (importData.settings) {
                const validatedSettings = { ...this.defaultSettings, ...importData.settings };
                await chrome.storage.sync.set({
                    extensionSettings: validatedSettings
                });
                this.currentSettings = validatedSettings;
                this.updateUI();
            }

            // Import mappings
            if (importData.mappings) {
                await chrome.storage.local.set({
                    productMappings: importData.mappings
                });
                await this.loadMappingsCount();
            }

            this.showSaveStatus('Settings imported successfully!');
        } catch (error) {
            console.error('Import failed:', error);
            this.showError('Import failed: ' + error.message);
        } finally {
            // Reset file input
            event.target.value = '';
        }
    }

    showSaveStatus(message) {
        const saveStatus = document.getElementById('save-status');
        saveStatus.textContent = message;
        saveStatus.style.color = '#28a745';

        setTimeout(() => {
            saveStatus.textContent = '';
        }, 3000);
    }

    showError(message) {
        const saveStatus = document.getElementById('save-status');
        saveStatus.textContent = message;
        saveStatus.style.color = '#dc3545';

        setTimeout(() => {
            saveStatus.textContent = '';
        }, 5000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async sendMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });
    }
}

// Initialize options page
let todoistReweOptions;

document.addEventListener('DOMContentLoaded', () => {
    todoistReweOptions = new TodoistReweOptions();
});
