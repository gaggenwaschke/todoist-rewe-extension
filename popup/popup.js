// Popup script for Todoist REWE Integration
class TodoistRewePopup {
    constructor() {
        this.currentProjects = [];
        this.currentTasks = [];
        this.selectedProject = null;
        this.selectedSection = null;
        this.currentTag = '';
        this.transferResults = null;
        this.pendingAmbiguousItems = [];
        this.currentAmbiguousIndex = 0;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.checkAuthStatus();
    }

    setupEventListeners() {
        // Authentication
        document.getElementById('auth-button').addEventListener('click', () => this.handleAuth());

        // Project selection
        document.getElementById('project-select').addEventListener('change', (e) => {
            this.handleProjectChange(e.target.value);
        });

        // Section selection
        document.getElementById('section-select').addEventListener('change', (e) => {
            this.handleSectionChange(e.target.value);
        });

        // Tag input
        document.getElementById('tag-input').addEventListener('input', (e) => {
            this.currentTag = e.target.value.trim();
            this.updateTaskPreview();
        });

        // Transfer button
        document.getElementById('transfer-button').addEventListener('click', () => this.handleTransfer());

        // Interactive transfer controls
        document.getElementById('finish-button').addEventListener('click', () => this.handleFinish());

        // REWE controls
        document.getElementById('open-rewe').addEventListener('click', () => this.handleOpenRewe());
        document.getElementById('added-to-cart').addEventListener('click', () => this.handleAddedToCart());
        document.getElementById('skip-item').addEventListener('click', () => this.handleSkip());

        // Results actions
        document.getElementById('new-transfer-button').addEventListener('click', () => this.resetToConfiguration());
        document.getElementById('open-rewe-button').addEventListener('click', () => this.openReweCart());

        // Modal controls
        document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
        document.getElementById('skip-product').addEventListener('click', () => this.skipCurrentProduct());
        document.getElementById('save-choice').addEventListener('click', () => this.saveProductChoice());
        document.getElementById('modal-overlay').addEventListener('click', () => this.closeModal());

        // Footer links
        document.getElementById('settings-link').addEventListener('click', (e) => {
            e.preventDefault();
            this.openOptionsPage();
        });
        document.getElementById('help-link').addEventListener('click', (e) => {
            e.preventDefault();
            this.showHelp();
        });
    }

    async checkAuthStatus() {
        try {
            const response = await this.sendMessage({ action: 'authenticateTodoist' });
            if (response.success) {
                this.showAuthenticatedState();
                await this.loadProjects();
            } else {
                this.showUnauthenticatedState();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.showUnauthenticatedState();
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
                this.showAuthenticatedState();
                await this.loadProjects();
            } else {
                this.showError('Authentication failed: ' + (response.error || 'Unknown error'));
                authButton.textContent = originalText;
                authButton.disabled = false;
            }
        } catch (error) {
            console.error('Authentication error:', error);
            this.showError('Authentication failed: ' + error.message);
            authButton.textContent = originalText;
            authButton.disabled = false;
        }
    }

    showAuthenticatedState() {
        const authStatus = document.getElementById('auth-status');
        const authIndicator = document.getElementById('auth-indicator');
        const authText = document.getElementById('auth-text');
        const authButton = document.getElementById('auth-button');

        authStatus.classList.add('authenticated');
        authIndicator.textContent = '✅';
        authText.textContent = 'Connected to Todoist';
        authButton.style.display = 'none';

        document.getElementById('config-section').classList.remove('hidden');
    }

    showUnauthenticatedState() {
        const authStatus = document.getElementById('auth-status');
        const authIndicator = document.getElementById('auth-indicator');
        const authText = document.getElementById('auth-text');
        const authButton = document.getElementById('auth-button');

        authStatus.classList.remove('authenticated');
        authIndicator.textContent = '⚠️';
        authText.textContent = 'Not authenticated';
        authButton.style.display = 'block';
        authButton.disabled = false;

        document.getElementById('config-section').classList.add('hidden');
        document.getElementById('transfer-section').classList.add('hidden');
    }

    async loadProjects() {
        const projectSelect = document.getElementById('project-select');
        projectSelect.innerHTML = '<option value="">Loading projects...</option>';

        try {
            const projects = await this.sendMessage({ action: 'getTodoistProjects' });
            this.currentProjects = projects;

            projectSelect.innerHTML = '<option value="">Select a project</option>';
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                projectSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load projects:', error);
            projectSelect.innerHTML = '<option value="">Error loading projects</option>';
        }
    }

    async handleProjectChange(projectId) {
        this.selectedProject = projectId;
        this.selectedSection = null;

        const sectionSelect = document.getElementById('section-select');

        if (!projectId) {
            sectionSelect.innerHTML = '<option value="">Select a project first</option>';
            this.updateTaskPreview();
            return;
        }

        sectionSelect.innerHTML = '<option value="">Loading sections...</option>';

        try {
            // For now, we'll use the main project without sections
            // In a full implementation, you'd load sections from Todoist API
            sectionSelect.innerHTML = '<option value="">All tasks in project</option>';

            this.updateTaskPreview();
        } catch (error) {
            console.error('Failed to load sections:', error);
            sectionSelect.innerHTML = '<option value="">Error loading sections</option>';
        }
    }

    handleSectionChange(sectionId) {
        this.selectedSection = sectionId;
        this.updateTaskPreview();
    }

    async updateTaskPreview() {
        const previewList = document.getElementById('preview-list');

        if (!this.selectedProject) {
            previewList.innerHTML = '<div class="loading">Select a project to preview tasks</div>';
            this.hideTransferSection();
            return;
        }

        previewList.innerHTML = '<div class="loading">Loading tasks...</div>';

        try {
            const tasks = await this.sendMessage({
                action: 'getFilteredTasks',
                projectId: this.selectedProject,
                sectionId: this.selectedSection,
                tag: this.currentTag
            });

            this.currentTasks = tasks;

            if (tasks.length === 0) {
                previewList.innerHTML = '<div class="loading">No tasks found with the specified criteria</div>';
                this.hideTransferSection();
            } else {
                this.renderTaskPreview(tasks);
                this.showTransferSection();
            }
        } catch (error) {
            console.error('Failed to load tasks:', error);
            previewList.innerHTML = '<div class="loading">Error loading tasks</div>';
            this.hideTransferSection();
        }
    }

    renderTaskPreview(tasks) {
        const previewList = document.getElementById('preview-list');
        previewList.innerHTML = '';

        tasks.forEach(task => {
            const taskElement = document.createElement('div');
            taskElement.className = 'task-item';

            const taskName = task.content || task.name;
            const taskLabels = task.labels || [];

            taskElement.innerHTML = `
                <span class="task-icon">📝</span>
                <span class="task-name">${this.escapeHtml(taskName)}</span>
                ${taskLabels.length > 0 ? `<span class="task-tags">${taskLabels.join(', ')}</span>` : ''}
            `;

            previewList.appendChild(taskElement);
        });
    }

    showTransferSection() {
        document.getElementById('transfer-section').classList.remove('hidden');
    }

    hideTransferSection() {
        document.getElementById('transfer-section').classList.add('hidden');
    }

    async handleTransfer() {
        if (this.currentTasks.length === 0) {
            this.showError('No tasks to transfer');
            return;
        }

        const transferButton = document.getElementById('transfer-button');
        const transferText = document.getElementById('transfer-text');
        const transferLoading = document.getElementById('transfer-loading');

        transferButton.disabled = true;
        transferText.classList.add('hidden');
        transferLoading.classList.remove('hidden');

        try {
            // Start interactive transfer
            const result = await this.sendMessage({
                action: 'startInteractiveTransfer',
                tasks: this.currentTasks
            });

            if (result.success) {
                this.showInteractiveTransfer();
                await this.loadCurrentTask();
            } else {
                this.showError('Failed to start transfer: ' + result.error);
            }
        } catch (error) {
            console.error('Transfer failed:', error);
            this.showError('Transfer failed: ' + error.message);
        } finally {
            transferButton.disabled = false;
            transferText.classList.remove('hidden');
            transferLoading.classList.add('hidden');
        }
    }

    showInteractiveTransfer() {
        // Hide configuration and transfer sections
        document.getElementById('config-section').classList.add('hidden');
        document.getElementById('transfer-section').classList.add('hidden');

        // Show interactive section
        document.getElementById('interactive-section').classList.remove('hidden');
    }

    async loadCurrentTask() {
        try {
            const response = await this.sendMessage({ action: 'getCurrentTask' });

            if (response.completed) {
                this.showTransferComplete();
                return;
            }

            if (!response.success) {
                this.showError('Failed to load current task: ' + response.error);
                return;
            }

            // Update progress
            this.updateProgress(response.currentIndex + 1, response.totalTasks);

            // Update task display
            document.getElementById('task-name').textContent = response.taskName;
            document.getElementById('search-term').value = response.searchTerm;

            // Search for products
            await this.searchProducts(response.searchTerm);

        } catch (error) {
            console.error('Failed to load current task:', error);
            this.showError('Failed to load current task: ' + error.message);
        }
    }

    updateProgress(current, total) {
        const progressTitle = document.getElementById('progress-title');
        const progressFill = document.getElementById('progress-fill');

        progressTitle.textContent = `Processing Item ${current} of ${total}`;
        const percentage = (current / total) * 100;
        progressFill.style.width = `${percentage}%`;
    }

    async searchProducts(searchTerm) {
        const productsList = document.getElementById('products-list');
        const reweControls = document.getElementById('rewe-controls');
        const searchInstructions = document.getElementById('search-instructions');

        // Hide products list and show REWE controls
        productsList.classList.add('hidden');
        reweControls.classList.remove('hidden');

        // Update search instructions
        const taskName = document.getElementById('task-name').textContent;
        searchInstructions.textContent = `Search for "${searchTerm}" on the REWE website`;

        // Store current search term for the open button
        this.currentSearchTerm = searchTerm;
    }

    async handleOpenRewe() {
        // Open REWE search in new tab
        const searchUrl = `https://shop.rewe.de/productList?search=${encodeURIComponent(this.currentSearchTerm || '')}`;
        const tab = await chrome.tabs.create({ url: searchUrl, active: true });

        // Store the tab ID so we can close it later
        this.currentReweTabId = tab.id;
    }

    displayProducts(products) {
        const productsList = document.getElementById('products-list');
        productsList.innerHTML = '';

        products.forEach((product, index) => {
            const productElement = document.createElement('div');
            productElement.className = 'product-option';
            productElement.dataset.productIndex = index;

            const similarityPercent = Math.round((product.similarity || 0) * 100);

            productElement.innerHTML = `
                ${product.image ?
                    `<img src="${product.image}" alt="${this.escapeHtml(product.name)}">` :
                    '<div class="placeholder-image">🛒</div>'
                }
                <div class="product-info">
                    <div class="product-name">${this.escapeHtml(product.name)}</div>
                    <div class="product-price">${this.escapeHtml(product.price)}</div>
                    ${similarityPercent > 0 ? `<div class="product-similarity">${similarityPercent}% match</div>` : ''}
                </div>
            `;

            productElement.addEventListener('click', () => {
                document.querySelectorAll('.product-option').forEach(opt => opt.classList.remove('selected'));
                productElement.classList.add('selected');
            });

            productElement.addEventListener('dblclick', () => {
                this.selectProduct(product);
            });

            productsList.appendChild(productElement);
        });
    }

    async selectProduct(product) {
        try {
            const response = await this.sendMessage({
                action: 'selectProduct',
                productUrl: product.link
            });

            if (response.success) {
                await this.loadCurrentTask();
            } else {
                this.showError('Failed to select product: ' + response.error);
            }
        } catch (error) {
            console.error('Failed to select product:', error);
            this.showError('Failed to select product: ' + error.message);
        }
    }

    async handleSkip() {
        try {
            // Close the REWE tab if it exists
            await this.closeReweTab();

            const response = await this.sendMessage({ action: 'skipCurrentTask' });

            if (response.success) {
                await this.loadCurrentTask();
            } else {
                this.showError('Failed to skip task: ' + response.error);
            }
        } catch (error) {
            console.error('Failed to skip task:', error);
            this.showError('Failed to skip task: ' + error.message);
        }
    }

    async closeReweTab() {
        if (this.currentReweTabId) {
            try {
                await chrome.tabs.remove(this.currentReweTabId);
                this.currentReweTabId = null;
            } catch (error) {
                console.error('Failed to close REWE tab:', error);
                // Tab might already be closed by user, ignore error
            }
        }
    }

    async handleFinish() {
        try {
            const response = await this.sendMessage({ action: 'getTransferSummary' });

            if (response.success) {
                this.showTransferSummary(response);
            } else {
                this.showError('Failed to get transfer summary: ' + response.error);
            }
        } catch (error) {
            console.error('Failed to get transfer summary:', error);
            this.showError('Failed to get transfer summary: ' + error.message);
        }
    }

    async showTransferComplete() {
        // Hide interactive section
        document.getElementById('interactive-section').classList.add('hidden');

        // Automatically get the transfer summary and show completion dialog
        await this.handleFinish();
    }

    showTransferSummary(summary) {
        // Hide interactive section
        document.getElementById('interactive-section').classList.add('hidden');

        // Check if there are completed tasks to potentially mark as done in Todoist
        if (summary.completedTasks && summary.completedTasks.length > 0) {
            this.showTodoistCompletionDialog(summary);
        } else {
            this.showFinalSummary(summary);
        }
    }

    showTodoistCompletionDialog(summary) {
        // Show completion dialog instead of final summary
        const completedTasks = summary.completedTasks;
        const taskList = completedTasks.map(task => `• ${task.content || task.name}`).join('\n');

        const confirmMessage = `🎉 Transfer Complete!\n\nYou added ${summary.completed} items to your REWE cart.\n\nCompleted tasks:\n${taskList}\n\nWould you like to mark these tasks as completed in Todoist?`;

        if (confirm(confirmMessage)) {
            this.completeTasksInTodoist(completedTasks, summary);
        } else {
            this.showFinalSummary(summary);
        }
    }

    async completeTasksInTodoist(completedTasks, summary) {
        try {
            // Extract task IDs
            const taskIds = completedTasks.map(task => task.id);

            // Show loading message
            const successGroup = document.getElementById('success-results');
            const successList = document.getElementById('success-list');
            document.getElementById('results-section').classList.remove('hidden');
            successGroup.classList.remove('hidden');
            successList.innerHTML = `
                <div class="result-item">
                    <div class="item-name">⏳ Completing tasks in Todoist...</div>
                    <div class="item-details">Please wait while we mark your tasks as complete.</div>
                </div>
            `;

            // Complete tasks in Todoist
            const result = await this.sendMessage({
                action: 'completeTasksInTodoist',
                taskIds: taskIds
            });

            if (result.success) {
                this.showCompletionResults(result.results, summary);
            } else {
                this.showError('Failed to complete tasks in Todoist: ' + result.error);
                this.showFinalSummary(summary);
            }
        } catch (error) {
            console.error('Failed to complete tasks in Todoist:', error);
            this.showError('Failed to complete tasks in Todoist: ' + error.message);
            this.showFinalSummary(summary);
        }
    }

    showCompletionResults(todoistResults, summary) {
        const successGroup = document.getElementById('success-results');
        const successList = document.getElementById('success-list');

        successGroup.classList.remove('hidden');
        successList.innerHTML = `
            <div class="result-item">
                <div class="item-name">✅ Transfer & Todoist Update Complete!</div>
                <div class="item-details">
                    🛒 REWE: ${summary.completed} items added to cart<br>
                    ✓ Todoist: ${todoistResults.completed.length} tasks marked as complete<br>
                    ${todoistResults.failed.length > 0 ? `❌ Failed to complete: ${todoistResults.failed.length} tasks<br>` : ''}
                    ⏭️ Skipped: ${summary.skipped} items<br>
                    🔍 Refined searches: ${summary.refined}
                </div>
            </div>
        `;

        // Show failed completions if any
        if (todoistResults.failed.length > 0) {
            const failedGroup = document.getElementById('failed-results');
            const failedList = document.getElementById('failed-list');

            failedGroup.classList.remove('hidden');
            failedList.innerHTML = '';

            const headerElement = document.createElement('div');
            headerElement.className = 'result-item';
            headerElement.innerHTML = `
                <div class="item-name">Failed to complete in Todoist:</div>
                <div class="item-details">${todoistResults.failed.length} tasks could not be marked as complete</div>
            `;
            failedList.appendChild(headerElement);
        }
    }

    showFinalSummary(summary) {
        // Show results section
        document.getElementById('results-section').classList.remove('hidden');

        // Show summary without Todoist completion
        const successGroup = document.getElementById('success-results');
        const successList = document.getElementById('success-list');

        successGroup.classList.remove('hidden');
        successList.innerHTML = `
            <div class="result-item">
                <div class="item-name">📊 Transfer Summary</div>
                <div class="item-details">
                    Total tasks: ${summary.totalTasks}<br>
                    Completed: ${summary.completed}<br>
                    Skipped: ${summary.skipped}<br>
                    Refined searches: ${summary.refined}
                </div>
            </div>
        `;
    }

    showResults(results) {
        // Hide configuration and transfer sections
        document.getElementById('config-section').classList.add('hidden');
        document.getElementById('transfer-section').classList.add('hidden');

        // Show results section
        document.getElementById('results-section').classList.remove('hidden');

        // Show opened search tabs
        if (results.results && results.results.opened && results.results.opened.length > 0) {
            const successGroup = document.getElementById('success-results');
            const successList = document.getElementById('success-list');

            successGroup.classList.remove('hidden');
            successList.innerHTML = '';

            results.results.opened.forEach(item => {
                const resultElement = document.createElement('div');
                resultElement.className = 'result-item';
                resultElement.innerHTML = `
                    <div class="item-name">${this.escapeHtml(item.task)}</div>
                    <div class="item-details">Search opened for: "${this.escapeHtml(item.searchTerm)}"</div>
                `;
                successList.appendChild(resultElement);
            });

            // Update the success header
            const successHeader = document.querySelector('.success-header');
            if (successHeader) {
                successHeader.textContent = `🔍 ${results.results.opened.length} Search Tabs Opened`;
            }
        }

        // Show failed results
        if (results.results && results.results.failed && results.results.failed.length > 0) {
            const failedGroup = document.getElementById('failed-results');
            const failedList = document.getElementById('failed-list');

            failedGroup.classList.remove('hidden');
            failedList.innerHTML = '';

            results.results.failed.forEach(item => {
                const resultElement = document.createElement('div');
                resultElement.className = 'result-item';
                resultElement.innerHTML = `
                    <div class="item-name">${this.escapeHtml(item.task)}</div>
                    <div class="item-error">${this.escapeHtml(item.error)}</div>
                `;
                failedList.appendChild(resultElement);
            });
        }

        // Hide ambiguous results section since we're not using it anymore
        document.getElementById('ambiguous-results').classList.add('hidden');
    }

    handleAmbiguousResults(ambiguousItems) {
        this.pendingAmbiguousItems = ambiguousItems;
        this.currentAmbiguousIndex = 0;
        this.showNextAmbiguousItem();
    }

    showNextAmbiguousItem() {
        if (this.currentAmbiguousIndex >= this.pendingAmbiguousItems.length) {
            // All ambiguous items resolved
            this.closeModal();
            return;
        }

        const item = this.pendingAmbiguousItems[this.currentAmbiguousIndex];
        this.showDisambiguationModal(item);
    }

    showDisambiguationModal(item) {
        const modal = document.getElementById('disambiguation-modal');
        const overlay = document.getElementById('modal-overlay');
        const question = document.getElementById('disambiguation-question');
        const productOptions = document.getElementById('product-options');

        question.textContent = `Which product matches "${item.task}"?`;
        productOptions.innerHTML = '';

        item.products.forEach((product, index) => {
            const option = document.createElement('div');
            option.className = 'product-option';
            option.dataset.productIndex = index;

            const similarityPercent = Math.round(product.similarity * 100);

            option.innerHTML = `
                ${product.image ? `<img src="${product.image}" alt="${product.name}">` : '<div style="width: 40px; height: 40px; background: #f0f0f0; border-radius: 4px;"></div>'}
                <div class="product-info">
                    <div class="product-name">${this.escapeHtml(product.name)}</div>
                    <div class="product-price">${this.escapeHtml(product.price)}</div>
                    <div class="product-similarity">${similarityPercent}% match</div>
                </div>
            `;

            option.addEventListener('click', () => {
                document.querySelectorAll('.product-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
            });

            productOptions.appendChild(option);
        });

        modal.classList.remove('hidden');
        overlay.classList.remove('hidden');
    }

    closeModal() {
        document.getElementById('disambiguation-modal').classList.add('hidden');
        document.getElementById('modal-overlay').classList.add('hidden');
    }

    skipCurrentProduct() {
        this.currentAmbiguousIndex++;
        this.showNextAmbiguousItem();
    }

    async saveProductChoice() {
        const selectedOption = document.querySelector('.product-option.selected');
        if (!selectedOption) {
            this.showError('Please select a product');
            return;
        }

        const productIndex = parseInt(selectedOption.dataset.productIndex);
        const currentItem = this.pendingAmbiguousItems[this.currentAmbiguousIndex];
        const selectedProduct = currentItem.products[productIndex];

        try {
            // Save the product mapping
            await this.sendMessage({
                action: 'saveProductMapping',
                taskName: currentItem.task,
                reweProduct: selectedProduct
            });

            // Add the product to cart
            const addResult = await this.sendMessage({
                action: 'addProductToCart',
                productId: selectedProduct.id
            });

            if (addResult.success) {
                // Update results to show this item as successful
                this.transferResults.success.push({
                    task: currentItem.task,
                    product: selectedProduct,
                    message: 'Added after user selection'
                });
            }

            this.currentAmbiguousIndex++;
            this.showNextAmbiguousItem();
        } catch (error) {
            console.error('Failed to save product choice:', error);
            this.showError('Failed to save choice: ' + error.message);
        }
    }

    resetToConfiguration() {
        document.getElementById('results-section').classList.add('hidden');
        document.getElementById('config-section').classList.remove('hidden');
        document.getElementById('transfer-section').classList.remove('hidden');

        // Clear results
        document.getElementById('success-results').classList.add('hidden');
        document.getElementById('failed-results').classList.add('hidden');
        document.getElementById('ambiguous-results').classList.add('hidden');
    }

    async openReweCart() {
        try {
            await chrome.tabs.create({
                url: 'https://shop.rewe.de/cart',
                active: true
            });
        } catch (error) {
            console.error('Failed to open REWE cart:', error);
            this.showError('Failed to open REWE cart: ' + error.message);
        }
    }

    openOptionsPage() {
        chrome.runtime.openOptionsPage();
    }

    showHelp() {
        const helpText = `
Todoist REWE Integration Help:

1. First, connect your Todoist account
2. Select the project containing your shopping list
3. Choose the specific list/section (optional)
4. Enter a tag to filter tasks (optional, e.g., @shopping)
5. Review the tasks that will be transferred
6. Click "Transfer to REWE" to add items to your cart

Tips:
- Use tags to organize your shopping items
- The extension will remember your product choices
- Products not found will be reported in the results
        `;
        alert(helpText);
    }

    async handleAddedToCart() {
        try {
            // Close the REWE tab if it exists
            await this.closeReweTab();

            // User manually added product to cart, move to next task
            const response = await this.sendMessage({
                action: 'moveToNextTask'
            });

            if (response.success) {
                await this.loadCurrentTask();
            } else {
                this.showError('Failed to move to next task: ' + response.error);
            }
        } catch (error) {
            console.error('Failed to move to next task:', error);
            this.showError('Failed to move to next task: ' + error.message);
        }
    }

    async handleAddProductUrl() {
        const urlInput = document.getElementById('product-url-input');
        const productUrl = urlInput.value.trim();

        if (!productUrl) {
            this.showError('Please enter a product URL');
            return;
        }

        if (!productUrl.includes('shop.rewe.de')) {
            this.showError('Please enter a valid REWE product URL');
            return;
        }

        try {
            const response = await this.sendMessage({
                action: 'selectProduct',
                productUrl: productUrl
            });

            if (response.success) {
                urlInput.value = '';
                this.closeIframe();
                await this.loadCurrentTask();
            } else {
                this.showError('Failed to select product: ' + response.error);
            }
        } catch (error) {
            console.error('Failed to select product:', error);
            this.showError('Failed to select product: ' + error.message);
        }
    }

    closeIframe() {
        document.getElementById('rewe-iframe-container').classList.add('hidden');
        document.getElementById('product-url-input').value = '';
    }

    showReweIframe(searchTerm) {
        const iframeContainer = document.getElementById('rewe-iframe-container');
        const iframe = document.getElementById('rewe-iframe');

        // Show iframe with REWE search
        const searchUrl = `https://shop.rewe.de/productList?search=${encodeURIComponent(searchTerm)}`;
        iframe.src = searchUrl;

        iframeContainer.classList.remove('hidden');
    }

    showError(message) {
        // Simple error display - in a full implementation, you'd use a proper notification system
        console.error('Error:', message);
        alert('Error: ' + message);
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
                } else if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });
    }
}

// Initialize the popup when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TodoistRewePopup();
});
