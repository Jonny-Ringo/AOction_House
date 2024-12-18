import { createDataItemSigner, dryrun, message, result, results } from "https://unpkg.com/@permaweb/aoconnect@0.0.59/dist/browser.js";
import { knownCollections } from './collections.js';

const auctionProcessId = "w1HOBDLHByEPTVTdny3XzbWk6R6FAz9h0KQgDBdrP1w";
const historyProcessId = "_26RaTB0V3U2AMW2tU-9RxjzuscRW_4qMgRO27ogYa8";
let walletConnected = false;
let profileId = null;
let selectedAssetId = null;




async function connectWallet() {
    const connectWalletButton = document.getElementById("connectWalletButton");
    const isMobile = window.innerWidth <= 549;

    // Check if already connected, then disconnect
    if (walletConnected) {
        try {
            walletConnected = false;
            profileId = null;
            // Clear localStorage
            localStorage.removeItem('walletConnected');
            localStorage.removeItem('walletAddress');
            localStorage.removeItem('profileId');
            fetchOwnedAssets()
            connectWalletButton.classList.remove('connected');
            connectWalletButton.textContent = isMobile ? "" : "Connect";
            return;
        } catch (error) {
            console.error("Error disconnecting wallet:", error);
            showToast("Failed to disconnect wallet. Please try again.");
            return;
        }
    }

    try {
        if (typeof window.arweaveWallet !== 'undefined' && window.arweaveWallet.connect) {
            await window.arweaveWallet.connect(
                ["ACCESS_ADDRESS", "SIGN_TRANSACTION", "SIGNATURE"],
                {
                    name: "The AOction House",
                    logo: "https://arweave.net/AcCm-N2AOxI17KLIUqZOBxBFrExpvogn3IeM_oM2lUo",
                }
            );

            const connectedWallet = await window.arweaveWallet.getActiveAddress();
            if (!connectedWallet) {
                throw new Error("Unable to retrieve the wallet address.");
            }

            // Set wallet state and update button
            walletConnected = true;
            // Save to localStorage
            localStorage.setItem('walletConnected', 'true');
            localStorage.setItem('walletAddress', connectedWallet);
            
            connectWalletButton.classList.add('connected');
            connectWalletButton.textContent = isMobile ? "" : 
                `${connectedWallet.slice(0, 3)}...${connectedWallet.slice(-3)}`;

            console.log("Wallet connected successfully:", connectedWallet);

            await getBazARProfile(); 
        } else {
            showToast("Arweave wallet not found. Please ensure ArConnect is installed and enabled.");
        }
    } catch (error) {
        console.error("Error connecting wallet:", error);
        showToast("Failed to connect to Arweave wallet. Please try again.");
    }
}

// Add this to your window load handler to set initial state
window.addEventListener('load', () => {
    const connectWalletButton = document.getElementById("connectWalletButton");
    if (walletConnected) {
        connectWalletButton.classList.add('connected');
    }
    // Set initial text based on screen size
    if (window.innerWidth <= 549) {
        connectWalletButton.textContent = "";
    }
});

document.addEventListener('DOMContentLoaded', async function() {
    // Check for existing connection
    const isConnected = localStorage.getItem('walletConnected');
    const savedAddress = localStorage.getItem('walletAddress');
    const savedProfileId = localStorage.getItem('profileId');
    
    if (isConnected === 'true' && savedAddress) {
        walletConnected = true;
        profileId = savedProfileId;
        const connectWalletButton = document.getElementById("connectWalletButton");
        connectWalletButton.textContent = `${savedAddress.slice(0, 3)}...${savedAddress.slice(-3)}`;
        if (savedProfileId) {
            await fetchOwnedAssets();
        }
    }

    // Fetch history catalog and wait for it to complete
    await fetchHistoryCatalog();

    // Now that we have the history entries, check for hash
    const hash = window.location.hash.slice(1);
    if (hash.startsWith('history/')) {
        const auctionId = hash.split('/')[1];
        const historyEntry = allHistoryEntries.find(entry => entry.AuctionId === auctionId);
        
        if (historyEntry) {
            // Fetch the asset name before opening the modal
            const assetName = await fetchAssetName(historyEntry.AssetID);
            openHistoryDetails({
                ...historyEntry,
                AssetName: assetName
            });
        }
    }
});

async function getBazARProfile() {
    try {
        const walletAddress = await window.arweaveWallet.getActiveAddress();
        console.log(`Getting BazAR profile for address: ${walletAddress}`);

        const signer = createDataItemSigner(window.arweaveWallet);

        const profileResponse = await dryrun({
            process: "SNy4m-DrqxWl01YqGM4sxI8qCni-58re8uuJLvZPypY",
            data: JSON.stringify({ Address: walletAddress }),
            tags: [{ name: "Action", value: "Get-Profiles-By-Delegate" }],
            anchor: "1234",
            signer: signer
        });

        console.log("Profile retrieval response:", profileResponse);

        if (profileResponse && profileResponse.Messages && profileResponse.Messages[0] && profileResponse.Messages[0].Data) {
            const profileData = JSON.parse(profileResponse.Messages[0].Data);
            if (profileData && profileData[0] && profileData[0].ProfileId) {
                profileId = profileData[0].ProfileId;
                localStorage.setItem('profileId', profileId);
                console.log("Retrieved Profile ID:", profileId);
                await fetchOwnedAssets();
                return; // Exit the function if the profile is found
            }
        }

        // If the profile is not found, throw an error
        throw new Error("No valid data found in the response.");
    } catch (error) {
        console.error("Error retrieving BazAR profile:", error);
        showToast(`Profile not found. Please create a profile at <a href="https://bazar.arweave.net/" target="_blank" style="color: #ffffff; text-decoration: underline;">BazAR</a>.`);
    }
}

let currentPage = 1;
const assetsPerPage = 10;
let totalPages = 1;
let allAssets = [];

// Fetch and paginate assets
async function fetchOwnedAssets() {
    try {
        if (!profileId) {
            console.error("Profile ID is not set.");
            allAssets = [];
            totalPages = 0;
            currentPage = 1;
            // Clear the displays if they exist
            const assetList = document.getElementById("assetList");
            if (assetList) {
                assetList.innerHTML = "";
            }
            return;
        }


        console.log(`Fetching assets for profile ID: ${profileId}`);

        const signer = createDataItemSigner(window.arweaveWallet);

        const assetResponse = await dryrun({
            process: profileId,
            data: JSON.stringify({ ProfileId: profileId }),
            tags: [
                { name: "Action", value: "Info" },
                { name: "Data-Protocol", value: "ao" },
                { name: "Type", value: "Message" },
                { name: "Variant", value: "ao.TN.1" }
            ],
            anchor: "1234",
            signer: signer
        });

        console.log("Asset retrieval response:", assetResponse);

        if (assetResponse && assetResponse.Messages && assetResponse.Messages[0] && assetResponse.Messages[0].Data) {
            const assetData = JSON.parse(assetResponse.Messages[0].Data);
            allAssets = assetData.Assets;
            totalPages = Math.ceil(allAssets.length / assetsPerPage);

            console.log(`Total assets: ${allAssets.length}, Total pages: ${totalPages}`);

        } else {
            throw new Error("No valid asset data found in the response.");
        }
    } catch (error) {
        console.error("Error fetching assets:", error);
    }
}

// Helper function to enable multiple buttons
function enableButtons(buttonIds) {
    buttonIds.forEach(id => {
        const button = document.getElementById(id);
        if (button) {
            button.disabled = false;
        } else {
            console.warn(`Button with ID '${id}' not found.`);
        }
    });
}

async function ensureWalletConnected() {
    if (!walletConnected) {
        throw new Error("Wallet not connected");  // Throw an error to stop the flow if not connected
    }
    return await window.arweaveWallet.getActiveAddress();  // Get active wallet address if connected
}

document.getElementById('listToggleButton').addEventListener('click', function(e) {
    // Set a flag to indicate we want the form open when we reach the home page
    localStorage.setItem('openListingForm', 'true');
});

// Global state variables
let historyPage = 1;  // Track the current history page
const historyPerPage = 15;  // Limit history entries per page
let totalHistoryPages = 1;  // Total number of history pages
let allHistoryEntries = [];  // Store all history entries globally for pagination

async function fetchHistoryCatalog() {
    try {
        showLoadingIndicator();

        const signer = createDataItemSigner(window.arweaveWallet);
        const historyResponse = await dryrun({
            process: historyProcessId,
            tags: [{ name: "Action", value: "Info" }],
            signer: signer
        });

        if (historyResponse?.Messages?.length > 0) {
            const entries = [];
            
            // Parse basic history data first
            for (const message of historyResponse.Messages) {
                const historyDataTag = message.Tags.find(tag => tag.name === "History");
                if (historyDataTag) {
                    const historyData = JSON.parse(historyDataTag.value);
                    entries.push(...historyData.map(entry => ({
                        ...entry,
                        formattedPrice: entry.FinalPrice > 0 ? 
                            (entry.FinalPrice / 1e12).toFixed(6) + " wAR" : "No Sale",
                        timestamp: new Date(entry.Expiry).toLocaleString(),
                        AssetName: null  // Initialize with null, will be loaded progressively
                    })));
                }
            }

            // Sort entries
            entries.sort((a, b) => b.Expiry - a.Expiry);
            
            // Update global state
            allHistoryEntries = entries;
            totalHistoryPages = Math.ceil(allHistoryEntries.length / historyPerPage);
            historyPage = 1;  // Reset to first page when loading new data

            // Display first page immediately
            hideLoadingIndicator();
            displayHistory(historyPage);

            // Load names for first page with higher priority
            const firstPageEntries = allHistoryEntries.slice(0, historyPerPage);
            const firstPagePromises = firstPageEntries.map(entry => 
                fetchAssetName(entry.AssetID).then(name => {
                    entry.AssetName = name;
                    // Trigger display update if we're still on first page
                    if (historyPage === 1) {
                        displayHistory(1);
                    }
                })
            );

            // Start loading remaining names in background with delay
            setTimeout(() => {
                const remainingEntries = allHistoryEntries.slice(historyPerPage);
                remainingEntries.forEach((entry, index) => {
                    setTimeout(() => {
                        fetchAssetName(entry.AssetID).then(name => {
                            entry.AssetName = name;
                        });
                    }, index * 50); // Stagger requests to prevent overwhelming
                });
            }, 1000); // Wait for first page to load

            // Wait for first page names before hiding loading indicator
            await Promise.all(firstPagePromises);
        }
    } catch (error) {
        console.error("Error fetching history:", error);
    } finally {
        hideLoadingIndicator();
    }
}

// Update changePage function to use global state
function changePage(newPage) {
    if (newPage >= 1 && newPage <= totalHistoryPages) {
        historyPage = newPage;
        
        // Display page immediately with loading states
        displayHistory(newPage);

        // Load any missing names for this page
        const pageStart = (newPage - 1) * historyPerPage;
        const pageEnd = pageStart + historyPerPage;
        const pageEntries = allHistoryEntries.slice(pageStart, pageEnd);
        
        pageEntries.forEach(entry => {
            if (!entry.AssetName) {
                fetchAssetName(entry.AssetID).then(name => {
                    entry.AssetName = name;
                    displayHistory(newPage);
                });
            }
        });
    }
}

// Function to show loading indicator
function showLoadingIndicator() {
    const loadingElement = document.createElement('div');
    loadingElement.id = 'loadingIndicator';
    loadingElement.className = 'loading-spinner-overlay';
    
    // Create spinner
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    
    // Add spinner to loading element
    loadingElement.appendChild(spinner);
    document.body.appendChild(loadingElement);
}

// Function to hide loading indicator
function hideLoadingIndicator() {
    const loadingElement = document.getElementById('loadingIndicator');
    if (loadingElement) {
        document.body.removeChild(loadingElement);
    }
}


function formatPrice(price) {
    return Number((price / 1e12).toFixed(6)).toString() + " wAR";
}

// Track the currently displayed page to avoid race conditions
let currentDisplayPage = 1;

async function displayHistory(page, filteredEntries = null) {
    // Update current page being displayed
    currentDisplayPage = page;
    const thisPageLoad = currentDisplayPage;
    
    const start = (page - 1) * historyPerPage;
    const end = start + historyPerPage;
    const pageEntries = (filteredEntries || allHistoryEntries).slice(start, end);

    const container = document.querySelector('.history-container');
    container.innerHTML = '';

    const entriesContainer = document.createElement('div');
    entriesContainer.className = 'entries-container';

    // Create a map to track entry elements by their index
    const entryElements = new Map();

    // Initial render of entries with loading state
    pageEntries.forEach((entry, index) => {
        const entryElement = document.createElement('div');
        entryElement.className = 'history-entry';
        
        // Render the entry with either existing name or loading state
        updateEntryElement(entryElement, entry);
        
        // Store reference to the element
        entryElements.set(index, entryElement);
        
        // Add click handler
        entryElement.addEventListener('click', () => {
            window.location.hash = `history/${entry.AuctionId}`;
            openHistoryDetails(entry);
        });

        entriesContainer.appendChild(entryElement);
    });

    container.appendChild(entriesContainer);
    container.appendChild(createPaginationControls());

    // Fetch asset names asynchronously
    const namePromises = pageEntries.map(async (entry, index) => {
        if (!entry.AssetName) {
            try {
                // Only update UI if we're still on the same page
                if (currentDisplayPage === thisPageLoad) {
                    const assetName = await fetchAssetName(entry.AssetID);
                    entry.AssetName = assetName;
                    
                    const entryElement = entryElements.get(index);
                    if (entryElement) {
                        updateEntryElement(entryElement, entry);
                    }
                }
            } catch (error) {
                console.error(`Failed to fetch name for asset ${entry.AssetID}:`, error);
            }
        }
    });

    // Optional: If you want to know when all names are loaded
    Promise.all(namePromises).then(() => {
        if (currentDisplayPage === thisPageLoad) {
            console.log('All asset names loaded for current page');
        }
    });
}

// Helper function to update an entry element
function updateEntryElement(element, entry) {
    element.innerHTML = `
        <img class="history-thumbnail" src="https://arweave.net/${entry.AssetID}" 
             onerror="this.src='placeholder.png'" alt="Asset ${entry.AssetID}">
        <div class="history-preview">
            <h3 class="history-title ${!entry.AssetName ? 'loading' : ''}">
                ${entry.AssetName || 'Loading...'}
            </h3>
            <div class="price-info">
                ${entry.Status === "EXPIRED" ? 
                    `<div class="expired">
                        <div>Start Price: ${formatPrice(entry.MinPrice)}</div>
                        <div>EXPIRED</div>
                    </div>` :
                    `<div class="sold">
                        <div>Start Price: ${formatPrice(entry.MinPrice)}</div>
                        <div>Sold For: ${formatPrice(entry.FinalPrice)}</div>
                    </div>`
                }
            </div>
        </div>`;
}

// Keep the existing createPaginationControls function as is
function createPaginationControls() {
    const paginationControls = document.createElement('div');
    paginationControls.className = 'pagination-controls';
    paginationControls.innerHTML = `
        <button id="prevPage" ${historyPage === 1 ? 'disabled' : ''}>← Prev</button>
        <span>Page ${historyPage} of ${totalHistoryPages}</span>
        <button id="nextPage" ${historyPage === totalHistoryPages ? 'disabled' : ''}>Next →</button>
    `;

    paginationControls.querySelector('#prevPage').addEventListener('click', () => {
        if (historyPage > 1) {
            changePage(historyPage - 1);
        }
    });

    paginationControls.querySelector('#nextPage').addEventListener('click', () => {
        if (historyPage < totalHistoryPages) {
            changePage(historyPage + 1);
        }
    });

    return paginationControls;
}

// Cache to store asset names and track pending requests
const assetNameCache = new Map();
const pendingRequests = new Map();

// Modified helper function to fetch asset name with request deduplication
async function fetchAssetName(assetId) {
    // If we already have the result cached, return it immediately
    if (assetNameCache.has(assetId)) {
        console.log(`Using cached result for asset ${assetId}`);
        return assetNameCache.get(assetId);
    }

    // If there's already a pending request for this asset,
    // wait for that request instead of making a new one
    if (pendingRequests.has(assetId)) {
        console.log(`Waiting for existing request for asset ${assetId}`);
        return pendingRequests.get(assetId);
    }

    // Create a new request promise and store it
    const requestPromise = (async () => {
        let assetName = "???";
        
        try {
            console.log(`Fetching info for asset ${assetId}`);
            const signer = createDataItemSigner(window.arweaveWallet);
            const detailsResponse = await dryrun({
                process: assetId,
                data: JSON.stringify({ Target: assetId }),
                tags: [
                    { name: "Action", value: "Info" },
                    { name: "Data-Protocol", value: "ao" },
                    { name: "Type", value: "Message" },
                    { name: "Variant", value: "ao.TN.1" }
                ],
                anchor: "1234",
                signer: signer
            });

            if (detailsResponse?.Messages?.[0]?.Data) {
                const nameData = JSON.parse(detailsResponse.Messages[0].Data);
                if (nameData.Name) {
                    assetName = nameData.Name;
                }
            }
        } catch (error) {
            console.error(`Failed to fetch details for asset ${assetId}:`, error);
        }

        // Store the result in cache
        assetNameCache.set(assetId, assetName);
        // Remove from pending requests
        pendingRequests.delete(assetId);
        
        return assetName;
    })();

    // Store the promise in pending requests
    pendingRequests.set(assetId, requestPromise);
    
    return requestPromise;
}

// Helper function to clear caches if needed
function clearAssetNameCaches() {
    assetNameCache.clear();
    pendingRequests.clear();
}

// Add this function to handle hash changes
window.addEventListener('hashchange', async () => {
    const hash = window.location.hash.slice(1);
    const modal = document.getElementById("historyDetailsModal");
    
    if (!hash) {
        modal.style.display = "none";
    } else if (hash.startsWith('history/')) {
        const auctionId = hash.split('/')[1];
        const historyEntry = allHistoryEntries.find(entry => entry.AuctionId === auctionId);
        
        if (historyEntry) {
            // Fetch additional details if needed
            let assetName = "???";
            try {
                const signer = createDataItemSigner(window.arweaveWallet);
                const detailsResponse = await dryrun({
                    process: historyEntry.AssetID,
                    data: JSON.stringify({ Target: historyEntry.AssetID }),
                    tags: [
                        { name: "Action", value: "Info" },
                        { name: "Data-Protocol", value: "ao" },
                        { name: "Type", value: "Message" },
                        { name: "Variant", value: "ao.TN.1" }
                    ],
                    anchor: "1234",
                    signer: signer
                });

                if (detailsResponse?.Messages?.[0]?.Data) {
                    const nameData = JSON.parse(detailsResponse.Messages[0].Data);
                    if (nameData.Name) {
                        assetName = nameData.Name;
                    }
                }
            } catch (error) {
                console.error(`Failed to fetch details for asset ${historyEntry.AssetID}:`, error);
            }

            openHistoryDetails({
                ...historyEntry,
                AssetName: assetName
            });
        }
    }
});

function openHistoryDetails(entry) {
    if (!entry) {
        console.error('No entry provided to openHistoryDetails');
        return;
    }

    const modal = document.getElementById("historyDetailsModal");
    if (!modal) {
        console.error('Modal element not found');
        return;
    }

    console.log('Opening history details for:', entry);

    const sellerFull = entry.Seller || "Unknown";
    const sellerTruncated = sellerFull.slice(0, 4) + "..." + sellerFull.slice(-4);
    const buyerFull = entry.Winner || "None";
    const buyerTruncated = buyerFull !== "None" ? buyerFull.slice(0, 4) + "..." + buyerFull.slice(-4) : "None";

    modal.innerHTML = `
        <div class="modal-container">
            <div class="modal-content">
                <div>
                    <p class="asset-owner">Seller: <span><a href="https://ao.link/#/entity/${sellerFull}" target="_blank">${sellerTruncated}</a></span></p>
                    <img src="https://arweave.net/${entry.AssetID}" alt="Asset Image" class="asset-image">
                </div>
                <div class="history-details">
                    <span class="close">&times;</span>
                    <h3>${entry.AssetName || "???"}</h3>
                    <div class="history-box">
                        <p class="history-quantity">Quantity: ${entry.Quantity || 1}</p>
                        <p class="history-price">Start Price: <span>${formatPrice(entry.MinPrice)}</span></p>
                        <p class="history-bid">Sold For: <span>${entry.FinalPrice ? formatPrice(entry.FinalPrice) : "Not Sold"}</span></p>
                        <p class="history-end">Auction Ended: ${new Date(parseInt(entry.Expiry)).toLocaleDateString()} 
                          ${new Date(parseInt(entry.Expiry)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        <p class="history-buyer">Buyer: <span>${buyerTruncated !== "None" ? `<a href="https://ao.link/#/entity/${buyerFull}" target="_blank">${buyerTruncated}</a>` : "None"}</span></p>
                    </div>
                </div>
            </div>
        </div>
    `;

    const closeButton = modal.querySelector(".close");
    closeButton.addEventListener('click', closeHistoryDetails);

    modal.style.display = "block";
}

function closeHistoryDetails() {
    const modal = document.getElementById("historyDetailsModal");
    modal.style.display = "none";
    // Clear the hash when closing if it's a history hash
    if (window.location.hash.startsWith('#history/')) {
        window.location.hash = '';
    }
}

document.getElementById('historySearch').addEventListener('input', async function(e) {
    const searchTerm = e.target.value.toLowerCase().trim();
    const dropdown = document.getElementById('searchDropdown');
    const collectionsResults = document.getElementById('collectionsResults');
    
    if (!searchTerm) {
        dropdown.style.display = 'none';
        return;
    }

    // Search for matching collections
    const matchingCollections = knownCollections.filter(collection => 
        collection.name.toLowerCase().includes(searchTerm)
    );

    if (matchingCollections.length > 0) {
        collectionsResults.innerHTML = `
            <div class="dropdown-section">
                <h3>Collections</h3>
                ${matchingCollections.map(collection => `
                    <div class="collection-item" data-id="${collection.id}">
                        <span>${collection.name}</span>
                    </div>
                `).join('')}
            </div>
        `;
        dropdown.style.display = 'block';

        // Add click handlers for collection items
        document.querySelectorAll('.collection-item').forEach(item => {
            item.addEventListener('click', async () => {
                const collectionId = item.dataset.id;
                await searchHistoryByCollection(collectionId);
                dropdown.style.display = 'none';
            });
        });
    } else {
        dropdown.style.display = 'none';
    }
});

document.getElementById('historySearch').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        performHistorySearch();
    }
});


async function performHistorySearch() {
    const searchTerm = (
        document.getElementById('historySearch').value.toLowerCase().trim() ||
        document.getElementById('historySearchOverlay').value.toLowerCase().trim()
    );

    if (!searchTerm) {
        historyPage = 1;
        totalHistoryPages = Math.ceil(allHistoryEntries.length / historyPerPage);
        await displayHistory(1);
        return;
    }

    const isFullAuctionId = /^[A-Za-z0-9_-]{32,}_\d+$/i.test(searchTerm);

    const matchedEntries = allHistoryEntries.filter(entry => 
        (isFullAuctionId ? 
            entry.AuctionId?.toLowerCase() === searchTerm :
            (entry.AssetName && entry.AssetName.toLowerCase().includes(searchTerm)))
    );

    if (matchedEntries.length === 0) {
        const container = document.querySelector('.history-container');
        container.innerHTML = '<p class="no-results">No matching history entries found</p>';
    } else {
        historyPage = 1;
        totalHistoryPages = Math.ceil(matchedEntries.length / historyPerPage);
        await displayHistory(1, matchedEntries);
    }
}

// Collection search function for history
async function searchHistoryByCollection(collectionId) {
    try {
        const signer = createDataItemSigner(window.arweaveWallet);
        
        // Fetch collection data
        const collectionResponse = await dryrun({
            process: collectionId,
            tags: [{ name: "Action", value: "Info" }],
            signer: signer
        });

        if (collectionResponse && collectionResponse.Messages && collectionResponse.Messages[0]) {
            const collectionData = JSON.parse(collectionResponse.Messages[0].Data);
            const collectionAssets = collectionData.Assets || [];

            // Filter history entries based on collection assets
            const matchedHistory = allHistoryEntries.filter(entry => 
                collectionAssets.includes(entry.AssetID)
            );

            // Update display
            historyPage = 1;
            totalHistoryPages = Math.ceil(matchedHistory.length / historyPerPage);

            if (matchedHistory.length === 0) {
                const container = document.querySelector('.history-container');
                container.innerHTML = '<p class="no-results">No history found for this collection</p>';
            } else {
                displayHistory(1, matchedHistory);
            }
        }
    } catch (error) {
        console.error("Error fetching collection data:", error);
        showToast("Error fetching collection data");
    }
}

const searchIcon = document.querySelector('.search-icon');
const searchOverlay = document.querySelector('.search-overlay');
const closeIcon = document.querySelector('.close-icon');

searchIcon.addEventListener('click', () => {
    searchOverlay.classList.add('active');
});

const searchDropdown = document.getElementById('searchDropdown');

closeIcon.addEventListener('click', function() {
    document.querySelector('.search-overlay').classList.remove('active');
    document.getElementById('historySearchOverlay').value = '';
    // Hide the dropdown
    if (searchDropdown) {
        searchDropdown.style.display = 'none';
    }
});



document.getElementById('historySearchOverlay').addEventListener('input', async function(e) {
    const searchTerm = e.target.value.toLowerCase().trim();
    const dropdown = document.getElementById('searchDropdown');
    const collectionsResults = document.getElementById('collectionsResults');

    if (!searchTerm) {
        dropdown.style.display = 'none';
        return;
    }

    // Search for matching collections
    const matchingCollections = knownCollections.filter(collection => 
        collection.name.toLowerCase().includes(searchTerm)
    );

    if (matchingCollections.length > 0) {
        collectionsResults.innerHTML = `
            <div class="dropdown-section">
                <h3>Collections</h3>
                ${matchingCollections.map(collection => `
                    <div class="collection-item" data-id="${collection.id}">
                        <span>${collection.name}</span>
                    </div>
                `).join('')}
            </div>
        `;
        dropdown.style.display = 'block';

        // Add click handlers for collection items
        document.querySelectorAll('.collection-item').forEach(item => {
            item.addEventListener('click', async () => {
                const collectionId = item.dataset.id;
                await searchHistoryByCollection(collectionId);
                dropdown.style.display = 'none';
            });
        });
    } else {
        dropdown.style.display = 'none';
    }
});

document.getElementById('historySearchOverlay').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        performHistorySearch();
    }
});



// Show toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-message toast-show';  // Add initial classes for visibility
    toast.innerHTML = message;
    document.body.appendChild(toast);

    // Set a timeout to remove the toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');

        // After the fade-out animation, remove the toast from the DOM
        setTimeout(() => {
            toast.remove();
        }, 700);  // Match this to the fade-out duration (0.5s)
    }, 4000);  // Show the toast for 3 seconds before starting the fade-out
}

window.connectWallet = connectWallet;