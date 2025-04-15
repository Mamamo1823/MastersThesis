/**
 * KEGG Pathway Visualization Tool
 * 
 * This script handles the visualization of KEGG pathway data with interactive features including:
 * - Collapsible tree structure display
 * - Heatmap color coding based on gene conservation values
 * - Custom pathway customization panel
 * - Real-time KEGG URL generation
 */

document.addEventListener("DOMContentLoaded", () => {
    // DOM Element References
    const jsonContainer = document.getElementById("jsonContainer");
    const colorSelection = document.getElementById("colorSelection");
    const customizeInterface = document.getElementById("customizeInterface");
    const pathwayInput = document.getElementById("pathwayInput");
    const keggUrlInput = document.getElementById("keggUrl");
    const keggLink = document.getElementById("keggLink");
    
    // Create and insert informational notice
    const notice = document.createElement('div');
    notice.className = 'custom-notice';
    notice.textContent = "Notice: Some K0 categories are stacked into one because they are entries for the same enzyme in different organism";
    colorSelection.parentNode.insertBefore(notice, colorSelection);

    // Initialize message container for user feedback
    const messageContainer = document.createElement("div");
    messageContainer.id = "message-container";
    document.body.prepend(messageContainer);

    // Data storage variables
    let keggData = null;
    let abundanceData = {};

    /**
     * Displays temporary messages to the user
     * @param {string} text - Message content
     * @param {string} type - Message type (error/success/warning)
     */
    const displayMessage = (text, type = "error") => {
        const msg = document.createElement("div");
        msg.className = `message ${type}`;
        msg.textContent = text;
        messageContainer.appendChild(msg);
        setTimeout(() => msg.remove(), 5000);
    };

    /**
     * Toggles visibility of the customization panel
     */
    window.toggleCustomPanel = () => {
        customizeInterface.classList.toggle('visible');
        const isVisible = customizeInterface.classList.contains('visible');
        window.scrollTo({
            top: isVisible ? customizeInterface.offsetTop - 20 : 0,
            behavior: 'smooth'
        });
    };

    /**
     * Loads and processes JSON data from external files
     */
    const loadJSON = async () => {
        try {
            // Fetch data from both endpoints simultaneously
            const [keggResponse, abundanceResponse] = await Promise.all([
                fetch('kegg_output.json'),
                fetch('kegg_abundance (1).json')
            ]);

            // Validate responses
            if (!keggResponse.ok || !abundanceResponse.ok) {
                throw new Error('Failed to load JSON files');
            }

            // Process JSON data
            const [keggJson, abundanceJson] = await Promise.all([
                keggResponse.json(),
                abundanceResponse.json()
            ]);

            // Store data and calculate normalization values
            keggData = keggJson;
            abundanceData = abundanceJson.kegg_categories;
            const nums = Object.values(abundanceData).filter(v => typeof v === 'number');
            abundanceData._max = Math.max(...nums);
            abundanceData._min = Math.min(...nums);

            // Render visualization and initialize URL
            renderJSON(keggData);
            updateKEGGUrl();
        } catch (error) {
            console.error(error);
            displayMessage(`Error loading data: ${error.message}`);
            jsonContainer.innerHTML = `<p class="error">Error loading data: ${error.message}</p>`;
        }
    };

    /**
     * Renders KEGG data into an interactive tree structure
     * @param {Object} data - Processed KEGG data
     */
    const renderJSON = (data) => {
        jsonContainer.innerHTML = "";
        const fragment = document.createDocumentFragment();

        /**
         * Creates a gene node element with interactive features
         * @param {string} kNumber - KEGG identifier
         * @param {string} description - Gene description
         * @param {number} level - Nesting level in hierarchy
         * @returns {HTMLElement|null} Gene node element or null if invalid
         */
        const createGeneNode = (kNumber, description, level) => {
            // Clean and validate input
            const cleanedDesc = description.trim();
            if (!cleanedDesc) return null;

            // Create node container
            const geneNode = document.createElement("div");
            geneNode.className = "gene-node";
            geneNode.style.marginLeft = `${level * 20}px`;
            
            // Calculate heatmap color
            const color = abundanceData[kNumber] ? getHeatmapColor(kNumber) : '#FFFFFF';
            
            // Populate node HTML
            geneNode.innerHTML = `
                <span class="color-indicator" style="background-color: ${color}"></span>
                <span class="gene-description">${cleanedDesc}</span>
            `;

            // Add conservation tooltip if data exists
            if (abundanceData[kNumber] !== undefined) {
                const tooltip = document.createElement("div");
                tooltip.className = "conservation-tooltip";
                tooltip.textContent = `Gene Conservation: ${abundanceData[kNumber].toFixed(2)}`;
                geneNode.appendChild(tooltip);
                geneNode.style.position = 'relative';

                // Tooltip interaction handlers
                geneNode.addEventListener('mouseenter', () => {
                    tooltip.style.display = 'block';
                });
                geneNode.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });
            }

            // Add click handler for customization
            geneNode.addEventListener('click', () => addECToCustomURL(kNumber));
            return geneNode;
        };

        /**
         * Creates a hierarchical tree node
         * @param {string} key - Node label
         * @param {Object|Array} value - Node contents
         * @param {number} level - Nesting level
         * @returns {HTMLElement|null} Tree node element or null if invalid
         */
        const createNode = (key, value, level) => {
            // Validate and clean input
            const cleanedKey = key.trim();
            if (!cleanedKey) return null;

            const node = document.createElement("div");
            node.className = "tree-node";
            node.style.marginLeft = `${level * 20}px`;

            if (typeof value === 'object' && !Array.isArray(value)) {
                // Handle object-type nodes
                const entries = Object.entries(value)
                    .filter(([k, v]) => k.trim() && v !== undefined);

                if (entries.length === 0) return null;

                node.innerHTML = `
                    <button class="toggle">▶</button>
                    <span class="node-label">${cleanedKey}</span>
                `;

                // Create children container
                const children = document.createElement("div");
                children.className = "children";
                entries.forEach(([k, v]) => {
                    const childNode = createNode(k, v, level + 1);
                    if (childNode) children.appendChild(childNode);
                });
                
                // Add toggle functionality
                node.appendChild(children);
                node.querySelector('.toggle').addEventListener('click', ({ target }) => {
                    const children = node.querySelector('.children');
                    children.classList.toggle('collapsed');
                    target.textContent = children.classList.contains('collapsed') ? '▶' : '▼';
                });

            } else if (Array.isArray(value)) {
                // Handle array-type nodes (pathways)
                const filteredValue = value.filter(entry => {
                    const entries = Object.entries(entry);
                    return entries.length > 0 && 
                         entries.some(([k, v]) => k.trim() && v.trim());
                });

                if (filteredValue.length === 0) return null;

                node.innerHTML = `
                    <button class="toggle">▶</button>
                    <span class="node-label pathway">${cleanedKey}</span>
                `;

                const children = document.createElement("div");
                children.className = "children collapsed";
                const meta = document.createElement("div");
                meta.className = "pathway-meta";

                // Add pathway controls
                const mapIdMatch = cleanedKey.match(/\[PATH:(ko\d+)\]/);
                if (mapIdMatch) {
                    const mapId = `map${mapIdMatch[1].replace('ko', '')}`;
                    const btnGroup = document.createElement("div");
                    btnGroup.className = "btn-group";

                    // Heatmap button
                    const heatmapBtn = createButton(
                        'Heatmap', 'fas fa-fire', 'primary',
                        () => handleHeatmapClick(mapId, filteredValue)
                    );

                    // Customization buttons
                    const customizeBtn = createButton(
                        'Custom', 'fas fa-palette', 'secondary',
                        () => handleCustomization(mapId)
                    );

                    const customizeHeatmapBtn = createButton(
                        'Customize Heatmap', 'fas fa-paint-brush', 'tertiary',
                        () => handleHeatmapCustomization(mapId, filteredValue)
                    );

                    // Assemble button group
                    btnGroup.append(heatmapBtn, customizeBtn, customizeHeatmapBtn);
                    meta.appendChild(btnGroup);
                }

                // Add gene nodes
                children.appendChild(meta);
                filteredValue.forEach(entry => {
                    for (const [kNumber, description] of Object.entries(entry)) {
                        if (!description.trim()) continue;
                        const geneNode = createGeneNode(kNumber, description, level + 1);
                        if (geneNode) children.appendChild(geneNode);
                    }
                });

                node.appendChild(children);
                node.querySelector('.toggle').addEventListener('click', ({ target }) => {
                    const children = node.querySelector('.children');
                    children.classList.toggle('collapsed');
                    target.textContent = children.classList.contains('collapsed') ? '▶' : '▼';
                });
            } else {
                // Handle leaf nodes
                const cleanedValue = String(value).trim();
                if (!cleanedValue) return null;

                node.innerHTML = `
                    <span class="node-label">${cleanedKey}:</span>
                    <span class="node-value">${cleanedValue}</span>
                `;
            }
            return node;
        };

        // Filter and render valid entries
        Object.entries(data)
            .filter(([key]) => ![
                "09180 Brite Hierarchies", 
                "09190 Not Included in Pathway or Brite",
                "09112 Not included in regular maps"
            ].includes(key) && key.trim())
            .forEach(([key, value]) => {
                const node = createNode(key, value, 0);
                if (node) fragment.appendChild(node);
            });

        jsonContainer.appendChild(fragment);
    };

    /**
     * Generates heatmap color based on conservation value
     * @param {string} kNumber - KEGG identifier
     * @returns {string} Hex color code
     */
    const getHeatmapColor = (kNumber) => {
        if (!abundanceData[kNumber]) return '#FFFFFF';
        const ratio = (abundanceData[kNumber] - abundanceData._min) / 
                     (abundanceData._max - abundanceData._min);
        const r = Math.round(ratio * 255);
        const b = Math.round((1 - ratio) * 255);
        return `#${r.toString(16).padStart(2,'0')}00${b.toString(16).padStart(2,'0')}`.toUpperCase();
    };

    /**
     * Generates KEGG pathway URL with heatmap colors
     * @param {string} mapId - KEGG pathway ID
     * @param {Array} kNumbers - Array of K numbers
     * @returns {string} Generated KEGG URL
     */
    const generateHeatmapKEGGUrl = (mapId, kNumbers) => {
        const dataset = kNumbers.map(k => 
            `${k}%09${encodeURIComponent(getHeatmapColor(k))}`
        ).join('/');
        return `https://www.kegg.jp/kegg-bin/show_pathway?${mapId}/${dataset}/default%3d%23FFFFFF`;
    };

    /**
     * Generates KEGG pathway URL with current customizations
     */
    const updateKEGGUrl = () => {
        const mapId = pathwayInput.value.trim();
        
        // Validate pathway ID format
        if (!/^map\d{5}$/.test(mapId)) {
            if (mapId) displayMessage("Invalid pathway ID. Must be in format map00000");
            keggUrlInput.value = '';
            keggLink.href = '#';
            keggLink.textContent = '';
            keggLink.classList.add('hidden');
            return;
        }

        // Collect customization options
        const ecOptions = [...document.querySelectorAll(".ec-color-option")];
        if (ecOptions.length === 0) {
            displayMessage("Please add at least one K number");
            return;
        }

        // Build URL parameters
        const queryParts = ecOptions.map(option => {
            const ecNumber = option.querySelector(".ec-number").value.trim();
            const bg = option.querySelector(".bgcolor").value.replace("#", "%23");
            const fg = option.querySelector(".fgcolor").value.replace("#", "%23");
            return `${encodeURIComponent(ecNumber)}%09${bg},${fg}`;
        });

        // Assemble final URL
        const defaultColor = "%23FFFFFF";
        const keggUrl = `https://www.kegg.jp/kegg-bin/show_pathway?${mapId}/${queryParts.join('/')}/default%3d${defaultColor}`;
        
        // Update UI elements
        keggUrlInput.value = keggUrl;
        keggLink.href = keggUrl;
        keggLink.textContent = 'Open KEGG Map';
        keggLink.classList.remove('hidden');
    };

    /**
     * Handles heatmap button click
     * @param {string} mapId - Pathway ID
     * @param {Array} values - Pathway values
     */
    const handleHeatmapClick = (mapId, values) => {
        const validKNumbers = values
            .flatMap(entry => Object.keys(entry))
            .filter(k => abundanceData[k]);
        
        if (validKNumbers.length === 0) {
            displayMessage("No valid K numbers found in abundance data", "warning");
            return;
        }
        window.open(generateHeatmapKEGGUrl(mapId, validKNumbers), '_blank');
    };

    /**
     * Handles custom button click
     * @param {string} mapId - Pathway ID
     */
    const handleCustomization = (mapId) => {
        if (colorSelection.children.length > 0) {
            const overwrite = confirm("This will overwrite existing customizations. Proceed?");
            if (!overwrite) return;
        }
        colorSelection.innerHTML = '';
        pathwayInput.value = mapId;
        toggleCustomPanel();
    };

    /**
     * Handles heatmap customization button click
     * @param {string} mapId - Pathway ID
     * @param {Array} values - Pathway values
     */
    const handleHeatmapCustomization = (mapId, values) => {
        if (colorSelection.children.length > 0) {
            const overwrite = confirm("This will overwrite existing customizations. Proceed?");
            if (!overwrite) return;
        }
        pathwayInput.value = mapId;
        colorSelection.innerHTML = '';
        
        const allKNumbers = values.flatMap(entry => Object.keys(entry));
        allKNumbers.forEach(k => {
            const currentColor = getHeatmapColor(k);
            addECToCustomURL(k, currentColor, '#FFFFFF');
        });
        
        toggleCustomPanel();
        displayMessage(`Added ${allKNumbers.length} K numbers to customization panel`, "success");
    };

    /**
     * Creates a styled button element
     * @param {string} text - Button text
     * @param {string} icon - Font Awesome icon class
     * @param {string} style - Button style (primary/secondary/tertiary)
     * @param {Function} handler - Click handler function
     * @returns {HTMLElement} Button element
     */
    const createButton = (text, icon, style, handler) => {
        const btn = document.createElement("button");
        btn.className = `btn btn-${style}`;
        btn.innerHTML = `<i class="${icon}"></i> ${text}`;
        btn.addEventListener('click', handler);
        return btn;
    };

    /**
     * Adds K number to customization panel
     * @param {string} kNumber - KEGG identifier
     * @param {string} bgColor - Background color
     * @param {string} fgColor - Text color
     */
    const addECToCustomURL = (kNumber, bgColor = '#FF0000', fgColor = '#FFFFFF') => {
        if ([...document.querySelectorAll('.ec-color-option')].some(input => 
            input.querySelector(".ec-number").value === kNumber
        )) {
            return;
        }

        const ecOption = document.createElement("div");
        ecOption.className = "ec-color-option";
        ecOption.innerHTML = `
            <input type="text" class="ec-number" value="${kNumber}" readonly>
            <div class="color-pickers">
                <label>
                    Background:
                    <input type="color" class="bgcolor" value="${bgColor}">
                </label>
                <label>
                    Text:
                    <input type="color" class="fgcolor" value="${fgColor}">
                </label>
            </div>
            <button class="btn btn-remove" onclick="removeECEntry(this)">
                <i class="fas fa-trash"></i>
            </button>
        `;
        colorSelection.appendChild(ecOption);
        updateKEGGUrl();
    };

    /**
     * Removes K number entry from customization panel
     * @param {HTMLElement} button - Clicked remove button
     */
    window.removeECEntry = (button) => {
        button.closest('.ec-color-option').remove();
        displayMessage("K number removed", "success");
        updateKEGGUrl();
    };

    // Event Listeners
    pathwayInput.addEventListener('input', (e) => {
        if (!/^map\d{0,5}$/.test(e.target.value)) {
            e.target.value = e.target.value.slice(0, -1);
            displayMessage("Only numbers allowed after 'map' prefix");
        }
        updateKEGGUrl();
    });

    colorSelection.addEventListener('input', updateKEGGUrl);

    // Initialize application
    loadJSON();
});