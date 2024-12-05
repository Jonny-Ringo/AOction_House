import { createDataItemSigner, dryrun, message, result, results } from "https://unpkg.com/@permaweb/aoconnect@0.0.59/dist/browser.js";
import { knownCollections } from './collections.js';

const auctionProcessId = "JcLv70VyPbCmyjvNrKLiHWKaPfKUxq2w9pRssdGlHBo";
let walletConnected = false;
let profileId = null;
let selectedAssetId = null;
let currentDisplayedAuctions = null;




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

            // Reset asset dropdown display
            const assetDropdown = document.querySelector("#assetDropdown .selected");
            if (assetDropdown) {
                assetDropdown.innerHTML = "<span>Your Collection</span>";
            }
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

            enableButtons(["cancelAuctionButton", "placeBidButton"]);

            await getBazARProfile(); 
        } else {
            showToast("Arweave wallet not found. Please ensure ArConnect is installed and enabled.");
        }
    } catch (error) {
        console.error("Error connecting wallet:", error);
        showToast("Failed to connect to Arweave wallet. Please try again.");
    }
}

// Add this to your page load handler
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
        enableButtons(["cancelAuctionButton", "placeBidButton"]);
        if (savedProfileId) {
            await fetchOwnedAssets();
        }
    }
});

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



async function getBazARProfile() {
    try {
        const walletAddress = await window.arweaveWallet.getActiveAddress();
        console.log(`Getting BazAR profile for address: ${walletAddress}`);

        const signer = createDataItemSigner(window.arweaveWallet);

        const profileResponse = await dryrun({
            process: "SNy4m-DrqxWl01YqGM4sxI8qCni-58re8uuJLvZPypY", // BazAR profile process ID
            data: JSON.stringify({ Address: walletAddress }),
            tags: [{ name: "Action", value: "Get-Profiles-By-Delegate" }],
            anchor: "1234",
            signer: signer
        });

        console.log("Profile retrieval response:", profileResponse);

        // Parse the profile data
        if (profileResponse && profileResponse.Messages && profileResponse.Messages[0] && profileResponse.Messages[0].Data) {
            const profileData = JSON.parse(profileResponse.Messages[0].Data);
            if (profileData && profileData[0] && profileData[0].ProfileId) {
                profileId = profileData[0].ProfileId;
                localStorage.setItem('profileId', profileId);  // Save profileId to localStorage
                console.log("Retrieved Profile ID:", profileId);
            } else {
                throw new Error("Profile ID not found in the response.");
            }
        } else {
            throw new Error("No valid data found in the response.");
        }

        await fetchOwnedAssets(); // Fetch the user's assets once the profile is found
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

            // Load the first page
            loadAssetsPage(currentPage);
        } else {
            throw new Error("No valid asset data found in the response.");
        }
    } catch (error) {
        console.error("Error fetching assets:", error);
    }
}

// Add this with your other event listeners
document.addEventListener('DOMContentLoaded', function() {
    const listToggleButton = document.getElementById('listToggleButton');
    const formContainer = document.querySelector('.form-container');

    // Check if we navigated here with intent to open the form
    if (localStorage.getItem('openListingForm') === 'true') {
        formContainer.style.display = 'block';
        localStorage.removeItem('openListingForm'); // Clear the flag
    }

    listToggleButton.addEventListener('click', function(e) {
        e.preventDefault();
        if (formContainer.style.display === 'none' || !formContainer.style.display) {
            formContainer.style.display = 'block';
        } else {
            formContainer.style.display = 'none';
        }
    });
});

let auctionPage = 1;  // Track the current auction page
const auctionsPerPage = 15;  // Limit auctions per page
let totalAuctionPages = 1;  // Total number of auction pages will be calculated based on the total auctions
let allLiveAuctions = [];  // Store all live auctions globally for pagination

// Function to fetch live auctions
async function fetchLiveAuctions() {
    try {
        console.log("Fetching live auctions...");

        const signer = createDataItemSigner(window.arweaveWallet);

        // Fetch auction data using a dryrun
        const auctionResponse = await dryrun({
            process: auctionProcessId,
            tags: [{ name: "Action", value: "Info" }],
            signer: signer,
        });

        console.log("Auction info dryrun response:", auctionResponse);

        if (auctionResponse && auctionResponse.Messages && auctionResponse.Messages.length > 0) {
            allLiveAuctions = [];

            for (const message of auctionResponse.Messages) {
                const auctionDataTag = message.Tags.find(tag => tag.name === "Auctions");
                const bidsDataTag = message.Tags.find(tag => tag.name === "Bids");

                if (auctionDataTag) {
                    const auctionData = JSON.parse(auctionDataTag.value); // Array of auction objects
                    let bidsData = {}; // Initialize as an empty dictionary

                    if (bidsDataTag) {
                        const rawBidsData = JSON.parse(bidsDataTag.value); // Array of bid objects
                        // Convert bids array into a dictionary keyed by AuctionId
                        bidsData = rawBidsData.reduce((acc, bid) => {
                            if (!acc[bid.AuctionId]) {
                                acc[bid.AuctionId] = [];
                            }
                            acc[bid.AuctionId].push(bid);
                            return acc;
                        }, {});
                    }

                    for (const auction of auctionData) {
                        const auctionId = String(auction.AuctionId); // Use AuctionId from the auction object
                        const auctionBids = bidsData[auctionId] || []; // Look up bids for this auction ID

                        let highestBid = "No Bids";
                        let latestBidder = "N/A";

                        if (auctionBids.length > 0) {
                            const highestBidData = auctionBids.reduce(
                                (max, bid) => (bid.Amount > max.Amount ? bid : max),
                                auctionBids[0]
                            );
                            highestBid = (highestBidData.Amount / 1e12).toFixed(6) + " wAR";
                            latestBidder = highestBidData.Bidder;
                        }

                        console.log(`Processed Auction ID: ${auctionId}, Highest Bid: ${highestBid}, Latest Bidder: ${latestBidder}`);

                        allLiveAuctions.push({
                            auctionId,
                            highestBid,
                            latestBidder,
                            ...auction,
                        });
                    }
                }
            }

            totalAuctionPages = Math.ceil(allLiveAuctions.length / auctionsPerPage);
            console.log(`Total live auctions: ${allLiveAuctions.length}, Total pages: ${totalAuctionPages}`);
            displayAuctions(auctionPage); // Call displayAuctions after fetching
        } else {
            console.error("No live auctions available.");
            showToast("No live auctions found.");
        }
    } catch (error) {
        console.error("Error fetching auctions:", error);
    }
}



// Function to display auctions with pagination
// Modify displayAuctions to use currentDisplayedAuctions
async function displayAuctions(page, forcedAuctions = null) {
    const auctionGrid = document.getElementById('auctionGrid');
    const paginationControls = document.getElementById('paginationControls');
    auctionGrid.innerHTML = '';

    // Use the appropriate auction list
    const auctionsToUse = forcedAuctions || currentDisplayedAuctions || allLiveAuctions;

    if (!auctionsToUse || auctionsToUse.length === 0) {
        auctionGrid.innerHTML = '<p>No auctions available</p>';
        return;
    }

    const startIndex = (page - 1) * auctionsPerPage;
    const endIndex = Math.min(startIndex + auctionsPerPage, auctionsToUse.length);
    const auctionsToDisplay = auctionsToUse.slice(startIndex, endIndex);

    console.log(`Displaying auctions for page ${page}:`, auctionsToDisplay);

    auctionGrid.style.display = 'grid';
    auctionGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
    auctionGrid.style.gap = '20px';

    const truncateAddress = (address) =>
        address.length > 10 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address;

    let connectedWallet = null;
    try {
        // Try to get the wallet address if the user has connected the wallet
        if (typeof window.arweaveWallet !== 'undefined') {
            connectedWallet = await window.arweaveWallet.getActiveAddress();
        }
    } catch (error) {
        console.log("No wallet connected, continuing to display auctions without wallet.");
    }

    for (const auction of auctionsToDisplay) {
        const assetId = auction.AssetID;

        const { name: auctionName, image: auctionImage } = await getAuctionDetails(auction.auctionId, assetId);

        const seller = auction.Seller || "Unknown";
        const truncatedSeller = truncateAddress(seller);
        let minBid = auction.MinPrice || 0;
        minBid = (minBid / 1e12).toFixed(6);
        const expiry = auction.Expiry || "Unknown";
        const modalQuantity = auction.Quantity || 1;

        const auctionThumbnail = document.createElement('div');
        auctionThumbnail.classList.add('auction-thumbnail');
        auctionThumbnail.style.padding = '10px';
        auctionThumbnail.style.borderRadius = '8px';

        auctionThumbnail.innerHTML = `
            <img src="${auctionImage}" alt="${auctionName}" class="thumbnail-image">
            <h3>${auctionName.length > 15 ? auctionName.slice(0, 15) + '...' : auctionName}</h3>
            <p>Current Bid: ${auction.highestBid}</p>
            <p>End: ${new Date(parseInt(expiry)).toLocaleDateString()} 
                ${new Date(parseInt(expiry)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
        `;

        // Change the URL update in the auction thumbnail click
        auctionThumbnail.onclick = async () => {
            // Use hash instead of pushState
            window.location.hash = `auction/${auction.auctionId}`;
            
            openAuctionDetails(
                auctionName, auctionImage, minBid, auction.highestBid, seller, expiry,
                auction.auctionId, null, connectedWallet, modalQuantity, auction.latestBidder
            );
        };

        auctionGrid.appendChild(auctionThumbnail);
    }

    paginationControls.innerHTML = `
        <button id="prevAuctionPage" ${auctionPage === 1 ? 'disabled' : ''}>←&nbsp;Prev</button>
        <span>Page ${auctionPage} of ${totalAuctionPages}</span>
        <button id="nextAuctionPage" ${auctionPage === totalAuctionPages ? 'disabled' : ''}>Next&nbsp;→</button>
    `;

    document.getElementById('prevAuctionPage').addEventListener('click', () => {
        if (auctionPage > 1) {
            auctionPage--;
            displayAuctions(auctionPage);
        }
    });

    document.getElementById('nextAuctionPage').addEventListener('click', () => {
        if (auctionPage < totalAuctionPages) {
            auctionPage++;
            displayAuctions(auctionPage);
        }
    });
}

// Update the page load handler to use hash
document.addEventListener('DOMContentLoaded', async () => {
    await fetchLiveAuctions();
    
    // Check hash instead of pathname
    const hash = window.location.hash.slice(1); // Remove the # symbol
    if (hash.startsWith('auction/')) {
        const auctionId = hash.split('/')[1];
        
        const auction = allLiveAuctions.find(a => a.auctionId === auctionId);
        if (auction) {
            const { name: auctionName, image: auctionImage } = await getAuctionDetails(auction.auctionId, auction.AssetID);
            
            openAuctionDetails(
                auctionName,
                auctionImage,
                (auction.MinPrice / 1e12).toFixed(6),
                auction.highestBid,
                auction.Seller,
                auction.Expiry,
                auction.auctionId,
                null,
                await window.arweaveWallet.getActiveAddress(),
                auction.Quantity,
                auction.latestBidder
            );
        }
    }
});

// Update popstate to use hashchange instead
window.addEventListener('hashchange', async () => {
    const hash = window.location.hash.slice(1);
    const modal = document.getElementById("auctionDetailsModal");
    
    if (!hash) {
        modal.style.display = "none";
    } else if (hash.startsWith('auction/')) {
        const auctionId = hash.split('/')[1];
        const auction = allLiveAuctions.find(a => a.auctionId === auctionId);
        if (auction) {
            const { name: auctionName, image: auctionImage } = await getAuctionDetails(auction.auctionId, auction.AssetID);
            
            openAuctionDetails(
                auctionName,
                auctionImage,
                (auction.MinPrice / 1e12).toFixed(6),
                auction.highestBid,
                auction.Seller,
                auction.Expiry,
                auction.auctionId,
                null,
                await window.arweaveWallet.getActiveAddress(),
                auction.Quantity,
                auction.latestBidder
            );
        }
    }
});

document.getElementById('auctionSearch').addEventListener('input', async function(e) {
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
                await searchByCollection(collectionId);
                dropdown.style.display = 'none';
            });
        });
    } else {
        dropdown.style.display = 'none';
    }
});

document.getElementById('auctionSearch').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        performSearch();
    }
});

async function performSearch() {
    const searchTerm = document.getElementById('auctionSearch').value.toLowerCase().trim() || 
                       document.getElementById('auctionSearchOverlay').value.toLowerCase().trim();

    // If search is empty, reset to original state
    if (!searchTerm) {
        currentDisplayedAuctions = null;
        auctionPage = 1;
        await fetchLiveAuctions();
        return;
    }

    // Filter auctions based on search term
    const filteredAuctions = await Promise.all(allLiveAuctions.map(async auction => {
        const { name } = await getAuctionDetails(auction.auctionId, auction.AssetID);
        const auctionName = name ? name.toLowerCase() : '';

        return {
            matches: auction.auctionId.toLowerCase().includes(searchTerm) || 
                    auctionName.includes(searchTerm),
            auction: auction,
            name: name
        };
    }));

    // Filter out non-matches and extract auction objects
    const matchedAuctions = filteredAuctions
        .filter(result => result.matches)
        .map(result => ({...result.auction, name: result.name}));

    // Update pagination for filtered results
    currentDisplayedAuctions = matchedAuctions;
    auctionPage = 1;
    totalAuctionPages = Math.ceil(matchedAuctions.length / auctionsPerPage);

    // Display filtered results
    if (matchedAuctions.length === 0) {
        const auctionGrid = document.getElementById('auctionGrid');
        auctionGrid.innerHTML = '<p class="no-results">No matching auctions found</p>';
        document.getElementById('paginationControls').innerHTML = '';
    } else {
        displayAuctions(1, matchedAuctions);
    }
}

// Collection search function
async function searchByCollection(collectionId) {
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

            // Filter auctions based on collection assets
            const matchedAuctions = allLiveAuctions.filter(auction => 
                collectionAssets.includes(auction.AssetID)
            );

            // Update display
            currentDisplayedAuctions = matchedAuctions;
            auctionPage = 1;
            totalAuctionPages = Math.ceil(matchedAuctions.length / auctionsPerPage);

            if (matchedAuctions.length === 0) {
                const auctionGrid = document.getElementById('auctionGrid');
                auctionGrid.innerHTML = '<p class="no-results">No auctions found for this collection</p>';
                document.getElementById('paginationControls').innerHTML = '';
            } else {
                displayAuctions(1, matchedAuctions);
            }
        }
    } catch (error) {
        console.error("Error fetching collection data:", error);
        showToast("Error fetching collection data");
    }
}

document.getElementById('auctionSearchOverlay').addEventListener('input', async function(e) {
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
                await searchByCollection(collectionId);
                dropdown.style.display = 'none';
            });
        });
    } else {
        dropdown.style.display = 'none';
    }
});

document.getElementById('auctionSearchOverlay').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        performSearch();
    }
});

// Function to fetch auction name and image using AssetID and log AuctionID
// Function to dryrun and fetch auction name (but use AssetID directly for the image URL)
async function getAuctionDetails(auctionId, assetId) {
    try {
        const signer = createDataItemSigner(window.arweaveWallet);

        const auctionDetailsResponse = await dryrun({
            process: assetId, // Use AssetID to fetch auction details
            tags: [
                { name: "Action", value: "Info" }
            ],
            signer: signer
        });

        console.log(`Details for asset ${assetId}:`, auctionDetailsResponse);

        if (auctionDetailsResponse && auctionDetailsResponse.Messages && auctionDetailsResponse.Messages[0]) {
            const auctionData = JSON.parse(auctionDetailsResponse.Messages[0].Data);
            console.log(`AuctionID: ${auctionId}, AssetID: ${assetId}`);

            return {
                auctionId,  // Return the AuctionID for tracking
                name: auctionData.Name || assetId,  // Default to asset ID if no name is found
                image: `https://arweave.net/${assetId}`  // Use AssetID for the image URL directly
            };
        } else {
            console.warn(`No data found for asset ${assetId}`);
            return {
                auctionId,  // Return the AuctionID
                name: assetId,  // Default to asset ID
                image: `https://arweave.net/${assetId}`  // Use AssetID for the image URL
            };
        }
    } catch (error) {
        console.error(`Error fetching auction details for asset ${assetId}:`, error);
        return {
            auctionId,  // Return the AuctionID for tracking
            name: assetId,
            image: `https://arweave.net/${assetId}`  // Use AssetID for the image URL as fallback
        };
    }
}



async function openAuctionDetails(auctionName, auctionImageURL, minBid, highestBid, seller, expiry, auctionId, bidsDataTag, connectedWallet, modalQuantity, latestBidder) {
    const modal = document.getElementById("auctionDetailsModal");
    console.log("Auction ID before modification:", auctionId);

    const sellerFull = seller || "Unknown";  // Full seller address for comparison
    const sellerTruncated = sellerFull.slice(0, 4) + "..." + sellerFull.slice(-4);  // Truncate for display
    // Truncate the latest bidder address
    const latestBidderTruncated = (latestBidder && latestBidder !== "N/A")
    ? latestBidder.slice(0, 4) + "..." + latestBidder.slice(-4)
    : "N/A";

    // Create the modal content structure
    const modalHTML = `
        <div class="modal-container">
        <div class="modal-content">
            <div>
            
            <p id= "seller" class="asset-owner">Owner: <span><a href="https://ao.link/#/entity/${sellerFull}" target="_blank">${sellerTruncated}</a></span></p>
            <img id="auctionImage" src="${auctionImageURL}" alt="Auction Image" class="auction-image">
            </div>
            <div class="auction-details">
                <span class="close">&times;</span>
                <h3 id="auctionName">${auctionName}</h3> 
                <div class= "auction-box">
                <p class="auction-quantity">Quantity: ${modalQuantity}</p>
                <p class="auction-price">Starting Price: <span>${minBid} wAR</span></p>
                <p class="auction-bid">Current Bid: <span>${highestBid}</span></p>

                <!-- Bid Section -->
                    <div class="bid-section">
                        <input type="number" class="bidAmountInput" step="0.000001" min="0.000001" placeholder="Enter bid amount">
                        <button id="placeBidButton" class="placeBidButton">Place Bid</button>

                    </div>



                <div class="auction-countdown">
                    <p class= "auction-end">Auction Ends: ${new Date(parseInt(expiry)).toLocaleDateString()} 
                          ${new Date(parseInt(expiry)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                     <p><span id="countdown-timer">00Days | 00Hrs | 00Mins | 00Sec</span></p>
                </div>

                <!-- Last Bidder Info -->
                <div class="last-bidder">
                    <h3>Last Bid</h3>
                    <p class="bidder-address">Address: <span><a href="https://ao.link/#/entity/${latestBidder}" target="_blank">${latestBidderTruncated}</a></span></p>
                    <p>Bid: <span>${highestBid}</span></p>
                </div>

                </div>
            </div>
        
        </div>
        <button id="cancelAuctionButton" class="button" style="display: none;">Cancel Auction</button>
        </div>
    `;
    
    // Set the modal content
    modal.innerHTML = modalHTML;

    // Countdown logic
    function startCountdown(endTime) {
        const countdownElement = document.getElementById("countdown-timer");

        function updateCountdown() {
            const currentTime = new Date().getTime();
            const timeDifference = endTime - currentTime;

            if (timeDifference <= 0) {
                countdownElement.innerHTML = "00 Days | 00 Hrs | 00 Mins | 00 Sec";
                clearInterval(countdownInterval);
                return;
            }

            const days = Math.floor(timeDifference / (1000 * 60 * 60 * 24)).toString().padStart(2, '0');
            const hours = Math.floor((timeDifference / (1000 * 60 * 60)) % 24).toString().padStart(2, '0');
            const minutes = Math.floor((timeDifference / (1000 * 60)) % 60).toString().padStart(2, '0');
            const seconds = Math.floor((timeDifference / 1000) % 60).toString().padStart(2, '0');

            countdownElement.innerHTML = `${days} Days | ${hours} Hrs | ${minutes} Mins | ${seconds} Sec`;
        }

        const countdownInterval = setInterval(updateCountdown, 1000);
        updateCountdown(); // Initial call to display the countdown immediately
    }

    // Start the countdown based on the expiry time
    const auctionEndTime = parseInt(expiry);  // expiry should be in milliseconds
    startCountdown(auctionEndTime);

    window.location.hash = `auction/${auctionId}`;

    // Show the modal
    modal.style.display = "block";

    // Get new references to elements
    const cancelButton = modal.querySelector("#cancelAuctionButton");
    const placeBidButton = modal.querySelector(".placeBidButton");
    const closeButton = modal.querySelector(".close");

    // Add close button functionality
    closeButton.addEventListener('click', closeAuctionDetails);

    try {
        // Rest of your existing code for wallet connection and button handling...
        const walletAddress = await ensureWalletConnected();


    // Show the cancel button only if the connected wallet matches the seller
    if (walletAddress === seller && highestBid === "No Bids") {
        cancelButton.style.display = "inline-block"; // Make the button visible
        cancelButton.onclick = async () => {
            try {
                const signer = createDataItemSigner(window.arweaveWallet);
                const cancelResponse = await message({
                    process: auctionProcessId,
                    tags: [
                        { name: "Action", value: "Cancel-Auction" },
                        { name: "AuctionId", value: auctionId }
                    ],
                    signer: signer
                });

                const resultData = await result({
                    message: cancelResponse,
                    process: auctionProcessId,
                });
                
                let successMessage;
                
                // Handle failure response using Output?.data
                if (resultData?.Output?.data && resultData.Output.data.includes("Cancel attempt failed")) {
                    successMessage = `Cancel attempt failed. Bids exist for auction: ${auctionId}`;
                }
                
                // Handle success response from Messages array
                else if (resultData?.Messages?.length > 0) {
                    const successData = resultData.Messages.find(msg => msg.Data && msg.Data.includes("Auction canceled successfully:"));
                    if (successData) {
                        successMessage = successData.Data; // Use the Data field directly for the success message
                    } else {
                        successMessage = "Auction canceled successfully.";
                    }
                } else {
                    successMessage = "Auction status update received.";
                }
                
                showToast(successMessage);
                await fetchLiveAuctions();
                await closeAuctionDetails();
                
            } catch (error) {
                console.error("Error canceling auction:", error);
                showToast("Error: Failed to cancel the auction.");
            }
        };
    }

    } catch (error) {
    console.error("No Wallet connected");
    }

    // Place Bid Button functionality
    placeBidButton.onclick = async function () {
        try {
            const bidAmountInput = modal.querySelector(".bidAmountInput");
            if (!bidAmountInput) {
                showToast("Error: Bid input field not found.");
                return;
            }

            const bidAmount = parseFloat(bidAmountInput.value);
            if (bidAmount <= 0) {
                showToast("Please enter a valid bid amount.");
                return;
            }

            await placeBid(auctionId, profileId, auctionProcessId, minBid, highestBid);
        } catch (error) {
            console.error("Error placing bid:", error);
            showToast("Error: No Wallet Connected");
        }
    };
}




async function placeBid(auctionId, bidderProfileId, auctionProcessId, minBid, highestBid) {
    const walletAddress = await ensureWalletConnected(); // Verify wallet connection

    if (!profileId) {
        showToast(`You need a BazAR profile to place bids. Please create one <a href="https://bazar.arweave.net/" target="_blank" style="color: #ffffff; text-decoration: underline;">here</a>.`);
        return;
    }

    const bidAmountInput = document.querySelector(".bidAmountInput");
    

    // Parse bid amount entered by the user
    const enteredBidAmount = parseFloat(bidAmountInput.value);
    console.log("Entered bid amount:", enteredBidAmount);

    if (!bidAmountInput || enteredBidAmount < 0.000001) {
        showToast("Error: Minimum bid is 0.000001 wAR.");
        console.log("Bid rejected: Entered bid is less than minimum bid requirement.");
        return;
    }

    // Handle case where highestBid is "No Bids" by setting it to 0
    const highestBidValue = highestBid === "No Bids" ? 0 : parseFloat(highestBid);
    console.log("minBid:", minBid, "highestBid (converted):", highestBidValue);

    // Get the greater value between minBid and highestBidValue
    const minimumRequiredBid = Math.max(minBid, highestBidValue);
    console.log("Bid must be more than:", minimumRequiredBid);

    // Compare entered bid with the minimum required bid
    if ((enteredBidAmount < minBid) || (highestBidValue !== 0 && enteredBidAmount <= highestBidValue)) {
        const errorMessage = highestBidValue !== 0
            ? `Error: Bid must be greater than ${highestBidValue} wAR.`
            : `Error: Bid must be at least ${minBid} wAR.`;

        showToast(errorMessage);
        console.log(`Bid rejected: Entered bid (${enteredBidAmount} wAR) is not valid.`);
        return;  // Prevent further execution if bid is too low
    }

    // Convert the bid to the correct 12-decimal format for wAR
    const bidAmount = (enteredBidAmount * 1e12).toString();
    console.log("Converted bid amount (12-decimal format):", bidAmount);

    try {
        // Step 1: Get the wallet address and store it in a variable
        const walletAddress = await window.arweaveWallet.getActiveAddress();
        const signer = createDataItemSigner(window.arweaveWallet);

        console.log("Proceeding to send the bid transaction...");

        // Step 2: Transfer the bid amount (wAR transfer)
        const transferResponse = await message({
            process: "xU9zFkq3X2ZQ6olwNVvr1vUWIjc3kXTWr7xKQD6dh10",  // wAR process
            tags: [
                { name: "Action", value: "Transfer" },
                { name: "Target", value: "xU9zFkq3X2ZQ6olwNVvr1vUWIjc3kXTWr7xKQD6dh10" }, // wAR static address
                { name: "Recipient", value: auctionProcessId },  // Auction process ID
                { name: "Quantity", value: bidAmount },  // Bid amount in 12-decimal format
                { name: "X-AuctionId", value: auctionId },  // Auction ID
                { name: "X-BidderProfileID", value: bidderProfileId }
            ],
            signer: signer
        });


        // Step 3: Wait for and verify the bid confirmation
        let bidConfirmed = false;
        let retryCount = 0;
        const maxRetries = 30;

        while (!bidConfirmed && retryCount < maxRetries) {
            const resultsOut = await results({
                process: auctionProcessId,
                sort: "DESC",
                limit: 3
            });
        
            // More strict message checking
            // More strict message checking
            // More strict message checking
            const messageFound = resultsOut.edges.some(edge => {
                if (!edge.node?.Messages) return false;
                
                return edge.node.Messages.some(msg => {
                    // Find the X-Data tag if it exists
                    const xDataTag = msg.Tags?.find(tag => tag.name === 'X-Data');
                    const xDataValue = xDataTag?.value;

                    // Log the actual message for debugging
                    console.log("Checking message:", {
                        expectedTarget: walletAddress,
                        actualTarget: msg.Target,
                        actualData: msg.Data,
                        actualXData: xDataValue,
                        matches: {
                            target: msg.Target === walletAddress,
                            successMatch: msg.Data === `Bid placed successfully for auction: ${auctionId}`,
                            refundMatch: xDataValue === `Bid is lower than the current highest bid. Refunding: ${bidAmount}`
                        }
                    });

                    // Check for success message (using original format)
                    if (msg.Target === walletAddress && msg.Data === `Bid placed successfully for auction: ${auctionId}`) {
                        console.log("Bid confirmation found with exact match");
                        showToast("Bid Placed Successfully!");
                        closeAuctionDetails();
                        fetchLiveAuctions();
                        return true;
                    }
                    
                    // Check for refund message (using Tags format)
                    if (msg.Tags?.find(tag => tag.name === 'Recipient')?.value === walletAddress && 
                        xDataValue === `Bid is lower than the current highest bid. Refunding: ${bidAmount}`) {
                        console.log("Bid refund message found for specific amount");
                        showToast("Bid was refunded: A higher bid was already placed");
                        closeAuctionDetails();
                        fetchLiveAuctions();
                        return true;
                    }

                    return false;
                });
            });
        
            if (messageFound) {
                return; // Exit the function if either message was found
            }
        
            // Wait before next retry
            await new Promise(resolve => setTimeout(resolve, 1000));
            retryCount++;
            console.log(`Waiting for bid confirmation... Attempt ${retryCount}/${maxRetries}`);
        }

        if (retryCount >= maxRetries) {
            throw new Error("Bid confirmation timeout - please check your transaction status");
        }

    } catch (error) {
        console.error("Error placing bid:", error);
        showToast(error.message || "Error placing bid. Please try again.");
    }
}






// Update closeAuctionDetails
function closeAuctionDetails() {
    const modal = document.getElementById("auctionDetailsModal");
    
    const bidAmountInput = modal.querySelector(".bidAmountInput");
    if (bidAmountInput) {
        bidAmountInput.value = "";
    }

    modal.style.display = "none";
    // Clear the hash instead of using pushState
    window.location.hash = '';
}


// Ensure modal close button is working
document.querySelector(".close").addEventListener('click', closeAuctionDetails);



// General function to close a specific modal by ID
function closeModalById(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = "none";
    }
}



// Close asset selection modal
document.querySelector("#assetSelectionModal .close").addEventListener("click", () => {
    closeModalById("assetSelectionModal");
});



async function fetchBalanceForAsset(assetId) {
    try {
        console.log(`Fetching balance for asset: ${assetId}`);

        const signer = createDataItemSigner(window.arweaveWallet);
        let availableQuantity = 0; // Default value

        try {
            const balanceResponse = await dryrun({
                process: assetId,
                tags: [{ name: "Action", value: "Info" }],
                signer: signer
            });

            console.log(`Balance response for asset ${assetId}:`, balanceResponse);

            if (balanceResponse && balanceResponse.Messages && balanceResponse.Messages[0]) {
                const assetData = JSON.parse(balanceResponse.Messages[0].Data);
                const balances = assetData.Balances || {};
                availableQuantity = balances[profileId] || 0;
            }
        } catch (dryrunError) {
            console.error(`Balance check failed for asset ${assetId}:`, dryrunError);
            // Continue execution with default quantity of 0
        }

        console.log(`Available Quantity for ${assetId}: ${availableQuantity}`);

        // Update quantity header
        document.getElementById("quantityHeader").innerText =
            `Quantity (Available: ${availableQuantity})`;

        // Remove any previously attached event listeners
        document.getElementById('listAssetButton').removeEventListener('click', handleListAssetClick);
        
        // Add a new event listener for this asset
        document.getElementById('listAssetButton').addEventListener('click', () => handleListAssetClick(availableQuantity));

    } catch (error) {
        console.error(`Error in fetchBalanceForAsset for ${assetId}:`, error);
        // Even if everything fails, still enable the button with 0 quantity
        document.getElementById("quantityHeader").innerText = `Quantity (Available: 0)`;
        document.getElementById('listAssetButton').addEventListener('click', () => handleListAssetClick(0));
    }
}


// Load a specific page of assets
async function loadAssetsPage(page) {
    const startIndex = (page - 1) * assetsPerPage;
    const endIndex = Math.min(startIndex + assetsPerPage, allAssets.length);
    const assetsToDisplay = allAssets.slice(startIndex, endIndex);

    const signer = createDataItemSigner(window.arweaveWallet);

    const assetDetails = await Promise.all(
        assetsToDisplay.map(async (asset) => {
            const nameResponse = await dryrun({
                process: asset.Id,
                data: JSON.stringify({ Target: asset.Id }),
                tags: [
                    { name: "Action", value: "Info" },
                    { name: "Data-Protocol", value: "ao" },
                    { name: "Type", value: "Message" },
                    { name: "Variant", value: "ao.TN.1" }
                ],
                anchor: "1234",
                signer: signer
            });

            let assetName = asset.Id;
            if (nameResponse && nameResponse.Messages && nameResponse.Messages[0] && nameResponse.Messages[0].Data) {
                const nameData = JSON.parse(nameResponse.Messages[0].Data);
                if (nameData.Name) {
                    assetName = nameData.Name;
                }
            }

            return {
                id: asset.Id,
                title: assetName,
                thumbnail: `https://arweave.net/${asset.Id}`
            };
        })
    );

    populateAssetList(assetDetails);

    // Update pagination buttons
    document.getElementById("prevPage").disabled = currentPage === 1;
    document.getElementById("nextPage").disabled = currentPage === totalPages;
}

// Populate the asset list in the modal
// Populate the asset list in the modal
function populateAssetList(assets) {
    const assetList = document.getElementById("assetList");
    assetList.innerHTML = ""; // Clear previous content

    assets.forEach(asset => {
        const option = document.createElement("div");
        option.className = "asset-option";

        option.innerHTML = `
            <img src="${asset.thumbnail}" alt="Thumbnail"">
            <span>${asset.title}</span>
        `;

        option.onclick = async () => {
            document.querySelector("#assetDropdown .selected").innerHTML = `
                <img src="${asset.thumbnail}" alt="Thumbnail">
                <span>${asset.title}</span>
            `;
            selectedAssetId = asset.id;
            closeModalById("assetSelectionModal");

            // **Fetch balance only on asset selection**
            await fetchBalanceForAsset(selectedAssetId);
        };

        assetList.appendChild(option);
    });
}


// Handle page navigation
document.getElementById("prevPage").addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        loadAssetsPage(currentPage);
    }
});

document.getElementById("nextPage").addEventListener("click", () => {
    if (currentPage < totalPages) {
        currentPage++;
        loadAssetsPage(currentPage);
    }
});

// Show the asset modal when clicked
document.querySelector("#assetDropdown .selected").addEventListener("click", () => {
    const modal = document.getElementById("assetSelectionModal");
    modal.style.display = "block";
});

// Trigger fetching the owned assets and show them in the modal
fetchOwnedAssets();




function calculateExpiryTimestamp(days) {
    const now = Date.now();
    const durationMs = days * 24 * 60 * 60 * 1000;  // Convert days to milliseconds
    return (now + durationMs).toString();
}

let isProcessing = false; // Flag to prevent multiple signer attempts
// A wrapper function to handle the listing process
async function handleListAssetClick(availableQuantity) {
    if (isProcessing) {
        console.warn("Already processing a listing. Please wait.");
        return; // Prevent double execution
    }

    isProcessing = true; // Set the flag to prevent multiple processing
    await listAsset(availableQuantity);
    isProcessing = false; // Reset the flag after processing
}

async function listAsset(availableQuantity) {
    console.log("List Asset button clicked!");

    const priceInput = document.getElementById("price").value;
    const durationInput = document.getElementById("durationDropdown").value;
    const quantityInputRaw = document.getElementById("quantity").value;
    const quantityInput = parseInt(quantityInputRaw);

    // Validation checks (omitted here for brevity)

    const minPrice = (priceInput * 1e12).toString();
    const expiryTimestamp = calculateExpiryTimestamp(durationInput);

    try {
        // Retrieve the wallet address as a string
        const signerAddress = await window.arweaveWallet.getActiveAddress();
        const signer = createDataItemSigner(window.arweaveWallet);

        // Ensure that signerAddress is a string before passing it to message
        if (typeof signerAddress !== "string") {
            throw new Error("Failed to retrieve signer address as a string.");
        }

        // Send the transfer message
        const transferResponse = await message({
            process: profileId,
            tags: [
                { name: "Action", value: "Transfer" },
                { name: "Target", value: selectedAssetId },
                { name: "Recipient", value: auctionProcessId },
                { name: "Quantity", value: quantityInput.toString() },
                { name: "X-MinPrice", value: minPrice },
                { name: "X-Expiry", value: expiryTimestamp },
                { name: "X-SellerProfileID", value: profileId },
                { name: "X-Seller", value: signerAddress }
            ],
            signer: signer
        });

        // Wait for and verify the auction creation
        let auctionConfirmed = false;
        let retryCount = 0;
        const maxRetries = 30;

        while (!auctionConfirmed && retryCount < maxRetries) {
            const resultsOut = await results({
                process: auctionProcessId,
                sort: "DESC",
                limit: 3
            });

            console.log("Checking response:", JSON.stringify(resultsOut, null, 2));

            // Check messages for confirmation
            for (const edge of resultsOut.edges) {
                if (!edge.node?.Messages) continue;
                
                for (const msg of edge.node.Messages) {
                    if (msg.Target === signerAddress && 
                        msg.Data?.includes("Auction created successfully with ID:")) {
                        
                        // Parse the confirmation message
                        const auctionDetails = msg.Data.match(/ID: (.+?) Quantity: (\d+) Expiry: (\d+)/);
                        
                        if (auctionDetails && 
                            parseInt(auctionDetails[2]) === quantityInput && 
                            parseInt(auctionDetails[3]) === parseInt(expiryTimestamp)) {  // Convert both to numbers
                            
                            console.log("Found confirmation message:", msg.Data);
                            const newAuctionId = auctionDetails[1];
                            showToast(msg.Data);
                            await resetAssetSelection();
                            await fetchLiveAuctions();
                            window.location.hash = `auction/${newAuctionId}`;
                            await fetchOwnedAssets();
                            return;
                        } else {
                            console.error("Auction details mismatch:", {
                                expectedQuantity: quantityInput,
                                receivedQuantity: auctionDetails ? parseInt(auctionDetails[2]) : null,
                                expectedExpiry: parseInt(expiryTimestamp),  // Convert to number for logging
                                receivedExpiry: auctionDetails ? parseInt(auctionDetails[3]) : null
                            });
                        }
                    }
                }
            }

            // Wait before next retry
            await new Promise(resolve => setTimeout(resolve, 1000));
            retryCount++;
            console.log(`Waiting for auction creation confirmation... Attempt ${retryCount}/${maxRetries}`);
        }

        if (retryCount >= maxRetries) {
            throw new Error("Auction creation timeout - please check your transaction status");
        }

    } catch (error) {
        console.error("Error listing asset:", error);
        showToast(error.message || "Error listing asset. Please try again.");
    }
}


async function resetAssetSelection() {
    // Clear the selected asset ID
    selectedAssetId = null;

    // Reset the asset dropdown selection display
    const assetDropdownSelected = document.querySelector("#assetDropdown .selected");
    if (assetDropdownSelected) {
        assetDropdownSelected.innerHTML = "<span>Your Collection</span>";
    }

    // Reset the quantity header
    const quantityHeader = document.getElementById("quantityHeader");
    if (quantityHeader) {
        quantityHeader.innerText = "Quantity (Available: -)";
    }

    // Clear form input fields
    document.getElementById("price").value = "";       // Clear price input
    document.getElementById("quantity").value = "";    // Clear quantity input
    document.getElementById("durationDropdown").selectedIndex = 0; // Reset duration dropdown to default

    console.log("Asset selection and form fields reset.");
}


const searchIcon = document.querySelector('.search-icon');
const searchOverlay = document.querySelector('.search-overlay');
const closeIcon = document.querySelector('.close-icon');

searchIcon.addEventListener('click', () => {
    searchOverlay.classList.add('active');
});

closeIcon.addEventListener('click', () => {
    searchOverlay.classList.remove('active');
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
window.listAsset = listAsset;
