// Content script for REWE website integration
class ReweContentScript {
    constructor() {
        this.productSearchCache = new Map();
        this.setupMessageListener();
        this.initializeObserver();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep the message channel open for async responses
        });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'addTasksToCart':
                    const result = await this.addTasksToCart(message.tasks);
                    sendResponse(result);
                    break;

                case 'searchProduct':
                    const searchResult = await this.searchProduct(message.productName);
                    sendResponse(searchResult);
                    break;

                case 'addProductToCart':
                    const addResult = await this.addProductToCart(message.productId);
                    sendResponse(addResult);
                    break;

                case 'getSearchResults':
                    const searchResults = await this.getSearchResults(message.maxResults);
                    sendResponse(searchResults);
                    break;

                default:
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Content script error:', error);
            sendResponse({ error: error.message });
        }
    }

    initializeObserver() {
        // Watch for dynamic content changes on REWE website
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    this.handleDynamicContent();
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    async addTasksToCart(tasks) {
        const results = {
            success: [],
            failed: [],
            ambiguous: []
        };

        for (const task of tasks) {
            try {
                const taskName = task.content || task.name;
                console.log(`Processing task: ${taskName}`);

                // Check for existing product mapping
                const existingMapping = await this.getProductMapping(taskName);
                if (existingMapping) {
                    const addResult = await this.addProductToCart(existingMapping.id);
                    if (addResult.success) {
                        results.success.push({
                            task: taskName,
                            product: existingMapping,
                            message: 'Added using saved mapping'
                        });
                    } else {
                        results.failed.push({
                            task: taskName,
                            error: addResult.error || 'Failed to add mapped product'
                        });
                    }
                    continue;
                }

                // Search for product
                const searchResult = await this.searchProduct(taskName);

                if (searchResult.products.length === 0) {
                    results.failed.push({
                        task: taskName,
                        error: 'Product not found'
                    });
                } else if (searchResult.products.length === 1) {
                    // Single match - add directly
                    const product = searchResult.products[0];
                    const addResult = await this.addProductToCart(product.id);

                    if (addResult.success) {
                        results.success.push({
                            task: taskName,
                            product: product,
                            message: 'Added automatically'
                        });
                        // Save mapping for future use
                        await this.saveProductMapping(taskName, product);
                    } else {
                        results.failed.push({
                            task: taskName,
                            error: addResult.error || 'Failed to add product'
                        });
                    }
                } else {
                    // Multiple matches - require user decision
                    results.ambiguous.push({
                        task: taskName,
                        products: searchResult.products.slice(0, 5) // Limit to top 5 matches
                    });
                }

                // Add delay between requests to avoid rate limiting
                await this.delay(500);
            } catch (error) {
                results.failed.push({
                    task: task.content || task.name,
                    error: error.message
                });
            }
        }

        return results;
    }

    async searchProduct(productName) {
        // Check cache first
        const cacheKey = productName.toLowerCase();
        if (this.productSearchCache.has(cacheKey)) {
            return this.productSearchCache.get(cacheKey);
        }

        try {
            // Navigate to search if not already there
            const searchUrl = `https://shop.rewe.de/products/search?search=${encodeURIComponent(productName)}`;

            if (!window.location.href.includes('search')) {
                window.location.href = searchUrl;
                await this.waitForPageLoad();
            } else {
                // Update search input if already on search page
                const searchInput = document.querySelector('input[name="search"], input[data-testid="search-input"], .search-input');
                if (searchInput) {
                    searchInput.value = productName;
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    searchInput.dispatchEvent(new Event('change', { bubbles: true }));

                    // Submit search
                    const searchButton = document.querySelector('button[type="submit"], .search-button, [data-testid="search-button"]');
                    if (searchButton) {
                        searchButton.click();
                    } else {
                        searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
                    }

                    await this.waitForSearchResults();
                }
            }

            // Extract product results
            const products = await this.extractProductResults(productName);

            const result = {
                query: productName,
                products: products
            };

            // Cache the result
            this.productSearchCache.set(cacheKey, result);

            return result;
        } catch (error) {
            console.error('Search error:', error);
            return {
                query: productName,
                products: [],
                error: error.message
            };
        }
    }

    async extractProductResults(query) {
        const products = [];

        // Common selectors for REWE product items
        const productSelectors = [
            '.product-item',
            '.product-card',
            '[data-testid="product-item"]',
            '.product-tile',
            '.product-list-item'
        ];

        let productElements = [];
        for (const selector of productSelectors) {
            productElements = document.querySelectorAll(selector);
            if (productElements.length > 0) break;
        }

        for (const element of productElements) {
            try {
                const product = this.extractProductInfo(element);
                if (product) {
                    // Calculate similarity score
                    product.similarity = this.calculateSimilarity(query, product.name);
                    products.push(product);
                }
            } catch (error) {
                console.error('Error extracting product info:', error);
            }
        }

        // Sort by similarity score (descending)
        products.sort((a, b) => b.similarity - a.similarity);

        return products;
    }

    extractProductInfo(element) {
        const nameElement = element.querySelector('.product-name, .product-title, [data-testid="product-name"], h3, h4');
        const priceElement = element.querySelector('.price, .product-price, [data-testid="product-price"]');
        const imageElement = element.querySelector('img');
        const linkElement = element.querySelector('a') || element;

        if (!nameElement) return null;

        const name = nameElement.textContent.trim();
        const price = priceElement ? priceElement.textContent.trim() : 'N/A';
        const image = imageElement ? imageElement.src : null;
        const link = linkElement ? linkElement.href : null;

        // Extract product ID from URL or data attributes
        let productId = null;
        if (linkElement) {
            const urlMatch = linkElement.href.match(/\/(\d+)$/);
            productId = urlMatch ? urlMatch[1] : null;
        }

        if (!productId) {
            productId = element.dataset.productId ||
                element.dataset.id ||
                element.getAttribute('data-product-id');
        }

        return {
            id: productId,
            name: name,
            price: price,
            image: image,
            link: link,
            element: element
        };
    }

    calculateSimilarity(query, productName) {
        const normalizedQuery = query.toLowerCase().trim();
        const normalizedProduct = productName.toLowerCase().trim();

        // Exact match
        if (normalizedQuery === normalizedProduct) return 1.0;

        // Contains match
        if (normalizedProduct.includes(normalizedQuery)) return 0.9;
        if (normalizedQuery.includes(normalizedProduct)) return 0.8;

        // Word-based matching
        const queryWords = normalizedQuery.split(/\s+/);
        const productWords = normalizedProduct.split(/\s+/);

        let matchingWords = 0;
        for (const queryWord of queryWords) {
            for (const productWord of productWords) {
                if (productWord.includes(queryWord) || queryWord.includes(productWord)) {
                    matchingWords++;
                    break;
                }
            }
        }

        const wordScore = matchingWords / Math.max(queryWords.length, productWords.length);

        // Levenshtein distance for fuzzy matching
        const levenshteinScore = 1 - (this.levenshteinDistance(normalizedQuery, normalizedProduct) /
            Math.max(normalizedQuery.length, normalizedProduct.length));

        return Math.max(wordScore, levenshteinScore * 0.7);
    }

    levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    async addProductToCart(productId) {
        try {
            // Find add to cart button for the product
            const addToCartButton = document.querySelector(
                `[data-product-id="${productId}"] .add-to-cart, ` +
                `[data-product-id="${productId}"] button[data-testid="add-to-cart"], ` +
                `[data-id="${productId}"] .add-to-cart`
            );

            if (addToCartButton) {
                addToCartButton.click();
                await this.delay(1000); // Wait for cart update
                return { success: true };
            } else {
                return { success: false, error: 'Add to cart button not found' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async waitForPageLoad() {
        return new Promise((resolve) => {
            if (document.readyState === 'complete') {
                resolve();
            } else {
                window.addEventListener('load', resolve);
            }
        });
    }

    async waitForSearchResults() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 20;

            const checkResults = () => {
                const results = document.querySelectorAll('.product-item, .product-card, [data-testid="product-item"]');
                if (results.length > 0 || attempts >= maxAttempts) {
                    resolve();
                } else {
                    attempts++;
                    setTimeout(checkResults, 500);
                }
            };

            checkResults();
        });
    }

    async getSearchResults(maxResults = 5) {
        try {
            // Wait for search results to load
            await this.waitForSearchResults();

            // Get the search query from the page
            const searchInput = document.querySelector('input[name="search"], input[placeholder*="Suche"], .search-input');
            const query = searchInput ? searchInput.value : '';

            // Extract products from the current page
            const products = await this.extractCurrentPageProducts(query, maxResults);

            return {
                success: true,
                products: products,
                query: query
            };
        } catch (error) {
            console.error('Failed to get search results:', error);
            return {
                success: false,
                error: error.message,
                products: []
            };
        }
    }

    async extractCurrentPageProducts(query, maxResults) {
        const products = [];

        // Wait a bit more for dynamic content
        await this.delay(1000);

        // Try different selectors based on REWE website structure
        const productSelectors = [
            'article', // Most likely based on semantic HTML
            '.product-item',
            '.product-card',
            '[data-testid*="product"]',
            '.product-tile',
            '.product-list-item'
        ];

        let productElements = [];
        for (const selector of productSelectors) {
            productElements = document.querySelectorAll(selector);
            console.log(`Trying selector ${selector}: found ${productElements.length} elements`);
            if (productElements.length > 0) break;
        }

        // If no products found with specific selectors, try broader approach
        if (productElements.length === 0) {
            // Look for elements containing product information
            const potentialProducts = document.querySelectorAll('div[class*="product"], div[class*="tile"], div[class*="card"]');
            productElements = Array.from(potentialProducts).filter(el => {
                const hasImage = el.querySelector('img');
                const hasText = el.textContent.trim().length > 10;
                const hasPrice = el.textContent.includes('€') || el.textContent.includes(',');
                return hasImage && hasText && hasPrice;
            });
        }

        for (let i = 0; i < Math.min(productElements.length, maxResults); i++) {
            try {
                const element = productElements[i];
                const product = this.extractProductInfoFromElement(element);
                if (product) {
                    // Calculate similarity score if query exists
                    if (query) {
                        product.similarity = this.calculateSimilarity(query, product.name);
                    }
                    products.push(product);
                }
            } catch (error) {
                console.error('Error extracting product info from element:', error);
            }
        }

        // Sort by similarity score if query exists
        if (query) {
            products.sort((a, b) => b.similarity - a.similarity);
        }

        return products;
    }

    extractProductInfoFromElement(element) {
        try {
            // Try multiple selectors for product name
            const nameSelectors = [
                'h3', 'h4', 'h5', // Header tags
                '[class*="name"]', '[class*="title"]', // Class-based
                '[data-testid*="name"]', '[data-testid*="title"]', // Test ID-based
                'a[href*="product"]', // Product links
                '.product-name, .product-title'
            ];

            let nameElement = null;
            let productName = '';

            for (const selector of nameSelectors) {
                nameElement = element.querySelector(selector);
                if (nameElement && nameElement.textContent.trim()) {
                    productName = nameElement.textContent.trim();
                    break;
                }
            }

            if (!productName) {
                // Fallback: look for any text that might be a product name
                const textElements = element.querySelectorAll('div, span, p');
                for (const textEl of textElements) {
                    const text = textEl.textContent.trim();
                    if (text.length > 10 && text.length < 100 && !text.includes('€') && !text.includes(',')) {
                        productName = text;
                        break;
                    }
                }
            }

            if (!productName) return null;

            // Extract price
            const priceSelectors = [
                '[class*="price"]',
                '[data-testid*="price"]',
                'span:contains("€")',
                'div:contains("€")'
            ];

            let priceElement = null;
            let price = 'N/A';

            for (const selector of priceSelectors) {
                priceElement = element.querySelector(selector);
                if (priceElement && priceElement.textContent.includes('€')) {
                    price = priceElement.textContent.trim();
                    break;
                }
            }

            // Fallback price extraction
            if (price === 'N/A') {
                const allText = element.textContent;
                const priceMatch = allText.match(/\d+,\d+\s*€/);
                if (priceMatch) {
                    price = priceMatch[0];
                }
            }

            // Extract image
            const imageElement = element.querySelector('img');
            const image = imageElement ? imageElement.src : null;

            // Extract link
            const linkElement = element.querySelector('a') || (element.tagName === 'A' ? element : null);
            let link = linkElement ? linkElement.href : null;

            // If no direct link, try to construct one
            if (!link && linkElement) {
                const href = linkElement.getAttribute('href');
                if (href) {
                    link = href.startsWith('http') ? href : `https://shop.rewe.de${href}`;
                }
            }

            // Extract product ID from URL or data attributes
            let productId = null;
            if (link) {
                const urlMatch = link.match(/\/(\d+)(?:\?|$)/);
                productId = urlMatch ? urlMatch[1] : null;
            }

            if (!productId) {
                productId = element.dataset.productId ||
                    element.dataset.id ||
                    element.getAttribute('data-product-id') ||
                    element.getAttribute('data-id');
            }

            return {
                id: productId,
                name: productName,
                price: price,
                image: image,
                link: link || `https://shop.rewe.de/productList?search=${encodeURIComponent(productName)}`,
                element: element
            };
        } catch (error) {
            console.error('Error extracting product info:', error);
            return null;
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getProductMapping(taskName) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'getProductMapping',
                taskName: taskName
            }, (response) => {
                resolve(response);
            });
        });
    }

    async saveProductMapping(taskName, product) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'saveProductMapping',
                taskName: taskName,
                reweProduct: product
            }, (response) => {
                resolve(response);
            });
        });
    }

    handleDynamicContent() {
        // Handle any dynamic content changes on REWE website
        // This can be extended based on specific REWE website behavior
    }
}

// Initialize the content script
const reweContentScript = new ReweContentScript();
