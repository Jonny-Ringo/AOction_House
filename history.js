import { createDataItemSigner, dryrun, message, result, results } from "https://unpkg.com/@permaweb/aoconnect@0.0.59/dist/browser.js";
import { knownCollections } from './collections.js';

const auctionProcessId = "JcLv70VyPbCmyjvNrKLiHWKaPfKUxq2w9pRssdGlHBo";
const historyProcessId = "_26RaTB0V3U2AMW2tU-9RxjzuscRW_4qMgRO27ogYa8";
let walletConnected = false;
let profileId = null;
let selectedAssetId = null;




async function connectWallet() {
    const connectWalletButton = document.getElementById("connectWalletButton");

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
            connectWalletButton.textContent = "Connect";
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
            
            connectWalletButton.textContent = `${connectedWallet.slice(0, 3)}...${connectedWallet.slice(-3)}`;

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

let historyPage = 1;  // Track the current history page
const historyPerPage = 15;  // Limit history entries per page
let totalHistoryPages = 1;  // Total number of history pages
let allHistoryEntries = [];  // Store all history entries globally for pagination

async function fetchHistoryCatalog() {
    try {
        console.log("Fetching auction history...");

        const signer = createDataItemSigner(window.arweaveWallet);

        // Fetch history data using a dryrun
        const historyResponse = await dryrun({
            process: historyProcessId,
            tags: [{ name: "Action", value: "Info" }],
            signer: signer
        });

        console.log("History info dryrun response:", historyResponse);

        if (historyResponse && historyResponse.Messages && historyResponse.Messages.length > 0) {
            allHistoryEntries = [];

            // Loop through history messages and extract data
            for (const message of historyResponse.Messages) {
                const historyDataTag = message.Tags.find(tag => tag.name === "History");

                if (historyDataTag) {
                    // Parse the history data
                    const historyData = JSON.parse(historyDataTag.value);

                    // Process each history entry
                    for (const entry of historyData) {
                        // Convert final price to wAR format if it exists
                        let finalPrice = "No Sale";
                        if (entry.FinalPrice > 0) {
                            finalPrice = (entry.FinalPrice / 1e12).toFixed(6) + " wAR";
                        }

                        // Add formatted entry to the array
                        allHistoryEntries.push({
                            ...entry,
                            formattedPrice: finalPrice,
                            timestamp: new Date(entry.Expiry).toLocaleString() // Convert timestamp to readable format
                        });
                    }
                }
            }

            // Sort entries by Expiry timestamp in descending order (newest first)
            allHistoryEntries.sort((a, b) => b.Expiry - a.Expiry);

            console.log("All history entries:", allHistoryEntries);
            totalHistoryPages = Math.ceil(allHistoryEntries.length / historyPerPage);
            console.log(`Total history entries: ${allHistoryEntries.length}, Total pages: ${totalHistoryPages}`);
            displayHistory(historyPage);
        } else {
            console.error("No auction history available.");
            showToast("No auction history found.");
        }
    } catch (error) {
        console.error("Error fetching history:", error);
    }
}

function formatPrice(price) {
    return Number((price / 1e12).toFixed(6)).toString() + " wAR";
}

async function displayHistory(page, filteredEntries = null) {
    const start = (page - 1) * historyPerPage;
    const end = start + historyPerPage;
    const pageEntries = (filteredEntries || allHistoryEntries).slice(start, end);

    const container = document.querySelector('.history-container');
    container.innerHTML = '';

    const entriesContainer = document.createElement('div');
    entriesContainer.className = 'entries-container';

    const signer = createDataItemSigner(window.arweaveWallet);

    // Fetch additional details and update main array
    const detailedEntries = await Promise.all(
        pageEntries.map(async (entry) => {
            // Check if we already have this entry with an AssetName in allHistoryEntries
            const existingEntry = allHistoryEntries.find(e => e.AuctionId === entry.AuctionId);
            if (existingEntry && existingEntry.AssetName) {
                return existingEntry;
            }

            let assetName = "Unnamed Asset";
            try {
                const detailsResponse = await dryrun({
                    process: entry.AssetID,
                    data: JSON.stringify({ Target: entry.AssetID }),
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
                console.error(`Failed to fetch details for asset ${entry.AssetID}:`, error);
            }

            // Create updated entry
            const updatedEntry = { ...entry, AssetName: assetName };

            // Update the entry in the main array
            const index = allHistoryEntries.findIndex(e => e.AuctionId === entry.AuctionId);
            if (index !== -1) {
                allHistoryEntries[index] = updatedEntry;
            }

            return updatedEntry;
        })
    );

        detailedEntries.forEach((entry) => {
        const entryElement = document.createElement('div');
        entryElement.className = 'history-entry';

        // Create thumbnail
        const thumbnail = document.createElement('img');
        thumbnail.className = 'history-thumbnail';
        thumbnail.src = `https://arweave.net/${entry.AssetID}`;
        thumbnail.alt = `Asset ${entry.AssetID}`;
        thumbnail.onerror = () => {
            thumbnail.src = 'placeholder.png';
        };

        // Update click event to use hash
        entryElement.addEventListener('click', () => {
            window.location.hash = `history/${entry.AuctionId}`;
            openHistoryDetails(entry);
        });

        const details = document.createElement('div');
        details.className = 'history-preview';

        const priceInfo = document.createElement('div');
        priceInfo.className = 'price-info';

        if (entry.Status === "EXPIRED") {
            priceInfo.innerHTML = `
            <div class="expired">
                <div>Start Price: ${formatPrice(entry.MinPrice)}</div>
                <div>EXPIRED</div>
            </div>
            `;
        } else {
            priceInfo.innerHTML = `
            <div class="sold">
                <div>Start Price: ${formatPrice(entry.MinPrice)}</div>
                <div>Sold For: ${formatPrice(entry.FinalPrice)}</div>
            </div>
            `;
        }

        const title = document.createElement('h3');
        title.className = 'history-title'; // Add a specific class
        title.textContent = entry.AssetName;

        details.appendChild(title);
        details.appendChild(priceInfo);
        entryElement.appendChild(thumbnail);
        entryElement.appendChild(details);
        entriesContainer.appendChild(entryElement);
    });

    container.appendChild(entriesContainer);

    // Pagination controls
    const paginationControls = document.createElement('div');
    paginationControls.className = 'pagination-controls';
    paginationControls.innerHTML = `
        <button id="prevPage" ${historyPage === 1 ? 'disabled' : ''}>← Prev</button>
        <span>Page ${historyPage} of ${totalHistoryPages}</span>
        <button id="nextPage" ${historyPage === totalHistoryPages ? 'disabled' : ''}>Next →</button>
    `;

    container.appendChild(paginationControls);

    document.getElementById('prevPage').addEventListener('click', () => {
        if (historyPage > 1) {
            historyPage--;
            displayHistory(historyPage);
        }
    });

    document.getElementById('nextPage').addEventListener('click', () => {
        if (historyPage < totalHistoryPages) {
            historyPage++;
            displayHistory(historyPage);
        }
    });
}

// Create a helper function to fetch asset name
async function fetchAssetName(assetId) {
    let assetName = "Unnamed Asset";
    try {
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
    return assetName;
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
            let assetName = "Unnamed Asset";
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
                    <h3>${entry.AssetName || "Unnamed Asset"}</h3>
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
    const searchTerm = document.getElementById('historySearch').value.toLowerCase().trim();

    if (!searchTerm) {
        historyPage = 1;
        await displayHistory(1);
        return;
    }

    // Use the cached names in allHistoryEntries for searching
    const matchedEntries = allHistoryEntries.filter(entry => 
        entry.AuctionId?.toLowerCase().includes(searchTerm) ||
        (entry.AssetName && entry.AssetName.toLowerCase().includes(searchTerm))
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