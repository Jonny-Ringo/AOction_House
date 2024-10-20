import { createDataItemSigner, dryrun, message, result } from "https://unpkg.com/@permaweb/aoconnect@0.0.59/dist/browser.js";

const auctionProcessId = "tuiYEcqFnQkKLSbOSuO5Lpg23zucGJv994KhZ93R33U";
let walletConnected = false;
let profileId = null;
let selectedAssetId = null;




async function connectWallet() {
    const connectWalletButton = document.getElementById("connectWalletButton");

    try {
        if (typeof window.arweaveWallet !== 'undefined' && window.arweaveWallet.connect) {
            await window.arweaveWallet.connect(
                ["ACCESS_ADDRESS", "SIGN_TRANSACTION", "SIGNATURE"],
                {
                    name: "The AOction House",
                    logo: "https://arweave.net/your-logo-url",
                }
            );

            const connectedWallet = await window.arweaveWallet.getActiveAddress();
            if (!connectedWallet) {
                throw new Error("Unable to retrieve the wallet address.");
            }

            // Set wallet state and update button
            walletConnected = true;
            connectWalletButton.textContent = `Connected: ${connectedWallet.slice(0, 6)}...${connectedWallet.slice(-4)}`;
            //connectWalletButton.style.backgroundColor = "#28a745"; // Green indicates success

            console.log("Wallet connected successfully:", connectedWallet);

            // Enable auction and bid buttons if needed
            enableButtons(["cancelAuctionButton", "placeBidButton"]);

            // Fetch user's BazAR profile and assets after wallet connection
            await getBazARProfile(); 
        } else {
            showToast("Arweave wallet not found. Please ensure ArConnect is installed and enabled.");
        }
    } catch (error) {
        console.error("Error connecting wallet:", error);
        showToast("Failed to connect to Arweave wallet. Please try again.");
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
            signer: signer
        });

        console.log("Auction info dryrun response:", auctionResponse);

        if (auctionResponse && auctionResponse.Messages && auctionResponse.Messages.length > 0) {
            allLiveAuctions = [];

            // Loop through auction messages and extract auction data
            for (const message of auctionResponse.Messages) {
                const auctionDataTag = message.Tags.find(tag => tag.name === "Auctions");
                const bidsDataTag = message.Tags.find(tag => tag.name === "Bids"); // Bids tag

                if (auctionDataTag) {
                    const auctionData = JSON.parse(auctionDataTag.value);
                    const bidsData = bidsDataTag ? JSON.parse(bidsDataTag.value) : {};

                    // Flatten auction items and include highest bids if available
                    for (const auctionId in auctionData) {
                        const auction = auctionData[auctionId];
                        const auctionBids = bidsData[auctionId] || [];

                        let highestBid = "No Bids"; // Default value if no bids
                        if (auctionBids.length > 0) {
                            const highestBidData = auctionBids.reduce(
                                (max, bid) => (bid.Amount > max.Amount ? bid : max),
                                auctionBids[0]
                            );
                            highestBid = (highestBidData.Amount / 1e12).toFixed(6) + " wAR";
                        }

                        // Push auction with bid data into the global array
                        allLiveAuctions.push({
                            auctionId,
                            highestBid, // Store highest bid in auction object
                            ...auction
                        });
                    }
                }
            }

            totalAuctionPages = Math.ceil(allLiveAuctions.length / auctionsPerPage);
            console.log(`Total live auctions: ${allLiveAuctions.length}, Total pages: ${totalAuctionPages}`);
            displayAuctions(auctionPage);
        } else {
            console.error("No live auctions available.");
            showToast("No live auctions found.");
        }
    } catch (error) {
        console.error("Error fetching auctions:", error);
    }
}


// Function to display auctions with pagination
async function displayAuctions(page) {
    const auctionGrid = document.getElementById('auctionGrid');
    const paginationControls = document.getElementById('paginationControls');
    auctionGrid.innerHTML = '';  // Clear previous content

    if (!allLiveAuctions || allLiveAuctions.length === 0) {
        auctionGrid.innerHTML = '<p>No auctions available</p>';
        return;
    }

    const startIndex = (page - 1) * auctionsPerPage;
    const endIndex = Math.min(startIndex + auctionsPerPage, allLiveAuctions.length);
    const auctionsToDisplay = allLiveAuctions.slice(startIndex, endIndex);

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
            <h3>${auctionName}</h3>
            <p>Current Bid: ${auction.highestBid}</p>
            <p>Quantity: ${modalQuantity}</p>
            <p>Seller: ${truncatedSeller}</p>
            <p>End: ${new Date(parseInt(expiry)).toLocaleDateString()} 
                ${new Date(parseInt(expiry)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
        `;

        // Allow viewing auction details without a wallet connection
        auctionThumbnail.onclick = async () => {
            openAuctionDetails(
                auctionName, auctionImage, minBid, auction.highestBid, seller, expiry,
                auction.auctionId, null, connectedWallet, modalQuantity
            );
        };

        auctionGrid.appendChild(auctionThumbnail);
    }

    paginationControls.innerHTML = `
        <button id="prevAuctionPage" ${auctionPage === 1 ? 'disabled' : ''}>Previous</button>
        <span>Page ${auctionPage} of ${totalAuctionPages}</span>
        <button id="nextAuctionPage" ${auctionPage === totalAuctionPages ? 'disabled' : ''}>Next</button>
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



// Open auction details modal
async function openAuctionDetails(auctionName, auctionImageURL, minBid, highestBid, seller, expiry, auctionId, bidsDataTag, connectedWallet, modalQuantity) {
    const modal = document.getElementById("auctionDetailsModal");

    // Set auction details in the modal
    document.getElementById("auctionName").innerText = auctionName;
    document.getElementById("auctionImage").src = auctionImageURL;
    document.getElementById("minBid").innerText = minBid;
    document.getElementById("currentBid").innerText = highestBid;
    document.getElementById("seller").innerText = seller;
    document.getElementById("expiry").innerText = new Date(parseInt(expiry)).toLocaleDateString() + ' ' + new Date(parseInt(expiry)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById("modalQuantity").innerText = modalQuantity;  // Display the quantity in the modal

    // Show the modal
    modal.style.display = "block";

    // Ensure the cancel button is hidden by default
    const cancelButton = modal.querySelector("#cancelAuctionButton");
    cancelButton.style.display = "none";  // Always start with the button hidden

    try {
        // Ensure the wallet is connected and get the wallet address
        const walletAddress = await ensureWalletConnected();  // This will throw if the wallet is not connected
        
        // Show the cancel button only if the connected wallet matches the seller
        if (walletAddress === seller) {
            cancelButton.style.display = "inline-block";  // Make the button visible
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
                        process: auctionProcessId
                    });

                    const successMessage = resultData.Output?.data || "Auction canceled successfully.";
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
    const placeBidButton = modal.querySelector(".placeBidButton");
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

            // Place the bid only after wallet is connected and valid input is given
            await placeBid(auctionId, profileId, auctionProcessId, minBid, highestBid);
        } catch (error) {
            console.error("Error placing bid:", error);
            showToast("Error: No Wallet Connected");
        }
    };
}




async function placeBid(auctionId, bidderProfileId, auctionProcessId, minBid, highestBid) {
    const bidAmountInput = document.querySelector(".bidAmountInput");
    const walletAddress = await ensureWalletConnected(); // Verify wallet connection

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
    const minimumRequiredBid = Math.max(minBid, highestBidValue); // Get the higher value
    console.log("Minimum required bid:", minimumRequiredBid);

    // Compare entered bid with the minimum required bid
    if (enteredBidAmount < minimumRequiredBid) {
        showToast(`Error: Bid must be greater than ${minimumRequiredBid} wAR.`);
        console.log(`Bid rejected: Entered bid (${enteredBidAmount} wAR) is less than minimum required bid (${minimumRequiredBid} wAR).`);
        return;  // Prevent further execution if bid is too low
    }

    // Convert the bid to the correct 12-decimal format for wAR
    const bidAmount = (enteredBidAmount * 1e12).toString();  // Convert to 12-decimal format
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
                { name: "Quantity", value: bidAmount }  // Bid amount in 12-decimal format
            ],
            signer: signer
        });

        console.log("Transfer command sent. Message ID:", transferResponse);

        // Step 3: Fetch the result of the transfer (Debit-Notice)
        const resultData = await result({
            message: transferResponse,  // Message ID from transferResponse
            process: "xU9zFkq3X2ZQ6olwNVvr1vUWIjc3kXTWr7xKQD6dh10"  // wAR process ID
        });

        const debitNotice = resultData.Messages?.find(
            msg => msg.Tags.some(tag => tag.name === "Action" && tag.value === "Debit-Notice")
        );

        if (debitNotice) {
            console.log("Debit-Notice received. Proceeding to place bid...");
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Step 4: Place the bid once the transfer is successful
            const bidResponse = await message({
                process: auctionProcessId,  // Auction process ID
                tags: [
                    { name: "Action", value: "Place-Bid" },
                    { name: "AuctionId", value: auctionId },  // Auction ID
                    { name: "BidderProfileID", value: bidderProfileId }  // Bidder's profile ID
                ],
                signer: signer
            });

            const bidResultData = await result({
                message: bidResponse,
                process: auctionProcessId  // Auction process ID
            });

            const successMessage = bidResultData.Output?.data || "Bid placed successfully.";
            showToast(successMessage);
            await fetchLiveAuctions();  // Refresh the auction list
            closeAuctionDetails();
        } else {
            console.error("No Debit-Notice found.");
            showToast("Error: Bid transfer failed.");
        }
    } catch (error) {
        console.error("Error placing bid:", error);
        showToast("Enter a bid amount to place a bid.");
    }
}




// Ensure modal close button triggers input reset
document.querySelector("#auctionDetailsModal .close").addEventListener("click", () => {
    closeAuctionDetails();  // Always reset on close
});


// Close auction details modal and reset the bid input
function closeAuctionDetails() {
    const modal = document.getElementById("auctionDetailsModal");
    
    // Clear the bid amount input field
    const bidAmountInput = modal.querySelector(".bidAmountInput");
    if (bidAmountInput) {
        bidAmountInput.value = ""; // Reset the input field
    }

    // Hide the modal
    modal.style.display = "none";
}


// Ensure modal close button is working
document.querySelector(".close").addEventListener('click', closeAuctionDetails);

// Fetch live auctions when the page loads
window.onload = fetchLiveAuctions;



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
                profileId = profileData[0].ProfileId;  // Store Profile ID globally
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
    }
}


// General function to close a specific modal by ID
function closeModalById(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = "none";
    }
}

// Close auction details modal
document.querySelector("#auctionDetailsModal .close").addEventListener("click", () => {
    closeModalById("auctionDetailsModal");
});

// Close asset selection modal
document.querySelector("#assetSelectionModal .close").addEventListener("click", () => {
    closeModalById("assetSelectionModal");
});

let currentPage = 1;
const assetsPerPage = 10;
let totalPages = 1;
let allAssets = [];

// Fetch and paginate assets
async function fetchOwnedAssets() {
    try {
        if (!profileId) {
            console.error("Profile ID is not set.");
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

async function fetchBalanceForAsset(assetId) {
    try {
        console.log(`Fetching balance for asset: ${assetId}`);

        const signer = createDataItemSigner(window.arweaveWallet);

        const balanceResponse = await dryrun({
            process: assetId,
            tags: [{ name: "Action", value: "Info" }],
            signer: signer
        });

        console.log(`Balance response for asset ${assetId}:`, balanceResponse);

        if (balanceResponse && balanceResponse.Messages && balanceResponse.Messages[0]) {
            const assetData = JSON.parse(balanceResponse.Messages[0].Data);
            const balances = assetData.Balances || {};
            const availableQuantity = balances[profileId] || 0;

            console.log(`Available Quantity for ${assetId}: ${availableQuantity}`);

            // Update quantity header
            document.getElementById("quantityHeader").innerText =
                `Quantity (Available: ${availableQuantity})`;

            // Remove any previously attached event listeners
            document.getElementById('listAssetButton').removeEventListener('click', handleListAssetClick);
            
            // Add a new event listener for this asset
            document.getElementById('listAssetButton').addEventListener('click', () => handleListAssetClick(availableQuantity));
        } else {
            console.warn(`No balance data found for asset: ${assetId}`);
        }
    } catch (error) {
        console.error(`Error fetching balance for asset ${assetId}:`, error);
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
    const quantityInputRaw = document.getElementById("quantity").value;  // Raw input value
    const quantityInput = parseInt(quantityInputRaw);  // Convert to integer

    // Check if the entered quantity exceeds available quantity
    if (quantityInput > availableQuantity) {
        showToast(`Error: You are trying to list more than available. Available quantity: ${availableQuantity}`);
        return;  // Prevent the function from proceeding
    }

    // Ensure quantity input is a valid number and greater than zero
    if (!quantityInputRaw || isNaN(quantityInput) || quantityInput <= 0) {
        showToast("Please enter a valid quantity.");
        return;  // Prevent further execution
    }

    if (!selectedAssetId || !priceInput || !durationInput || !profileId) {
        showToast("Please select an asset, enter price, choose duration, and ensure your profile ID is set.");
        return;  // Prevent further execution
    }

    // Proceed with the listing process
    const minPrice = (priceInput * 1e12).toString();
    const expiryTimestamp = calculateExpiryTimestamp(durationInput);

    try {
        const signer = createDataItemSigner(window.arweaveWallet);

        const transferResponse = await message({
            process: profileId,
            tags: [
                { name: "Action", value: "Transfer" },
                { name: "Target", value: selectedAssetId },
                { name: "Recipient", value: auctionProcessId },
                { name: "Quantity", value: quantityInput.toString() }
            ],
            signer: signer
        });

        console.log("Transfer command sent. Message ID:", transferResponse);

        const transferSuccess = await pollForTransferSuccess(profileId);

        await new Promise(resolve => setTimeout(resolve, 2000));

        if (transferSuccess) {
            console.log("Transfer-Success received. Proceeding to create auction...");

            const auctionResponse = await message({
                process: auctionProcessId,
                tags: [
                    { name: "Action", value: "Create-Auction" },
                    { name: "AuctionId", value: selectedAssetId },
                    { name: "MinPrice", value: minPrice },
                    { name: "Expiry", value: expiryTimestamp },
                    { name: "Quantity", value: quantityInput.toString() },
                    { name: "SellerProfileID", value: profileId }
                ],
                signer: signer
            });

            const auctionResultData = await result({
                message: auctionResponse,
                process: auctionProcessId
            });

            const successMessage = auctionResultData.Output?.data || "Auction created successfully.";
            showToast(successMessage);

            await resetAssetSelection();
            await fetchOwnedAssets();
            await fetchLiveAuctions();
        } else {
            showToast("Error: Transfer-Success message not received.");
        }
    } catch (error) {
        console.error("Error listing asset:", error);
        showToast("Error listing asset. Please try again.");
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



// Function to poll the results for Transfer-Received
async function pollForTransferSuccess(profileId) {
    const url = `https://cu.ao-testnet.xyz/results/${profileId}?sort=DESC`;

    try {
        let successFound = false;
        let attempts = 0;

        // Poll for a limited number of attempts (e.g., 5 attempts)
        while (!successFound && attempts < 5) {
            const response = await fetch(url);
            const result = await response.json();

            console.log("Polling result:", result);

            // Check if Transfer-Received message is in the result
            const transferReceived = result.edges.find(edge => {
                const output = edge.node.Output;
                if (output && output.data) {
                    // Log the raw output data to inspect the exact content
                    console.log("Raw Output Data:", output.data);

                    // Remove any ANSI escape codes from the output data
                    const cleanedData = removeAnsiCodes(output.data);

                    // Log the cleaned data after removing ANSI codes
                    console.log("Cleaned Output Data:", cleanedData);

                    // Check if the cleaned output contains the 'Transfer Received' action
                    return cleanedData.includes("Transfer Received");
                }
                return false;
            });

            if (transferReceived) {
                console.log("Transfer-Received message found:", transferReceived);

                // Display full message content using a toast
                const messageContent = transferReceived.node.Output.data;
                showToast(`Full message: ${removeAnsiCodes(messageContent)}`);

                successFound = true;
                return true;  // Success
            }

            // Wait for a few seconds before polling again
            await new Promise(resolve => setTimeout(resolve, 3000));  // Wait 3 seconds
            attempts++;
        }

        return false;  // Failed to find Transfer-Received message
    } catch (error) {
        console.error("Error polling Transfer-Received:", error);
        return false;
    }
}

// Function to remove ANSI escape codes from a string
function removeAnsiCodes(str) {
    return str.replace(/\u001b\[.*?m/g, "");
}


// Show toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-message toast-show';  // Add initial classes for visibility
    toast.textContent = message;
    document.body.appendChild(toast);

    // Set a timeout to remove the toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');

        // After the fade-out animation, remove the toast from the DOM
        setTimeout(() => {
            toast.remove();
        }, 500);  // Match this to the fade-out duration (0.5s)
    }, 3000);  // Show the toast for 3 seconds before starting the fade-out
}


window.connectWallet = connectWallet;
window.listAsset = listAsset;
