import { createDataItemSigner, dryrun, message, result } from "https://unpkg.com/@permaweb/aoconnect@0.0.59/dist/browser.js";

const auctionProcessId = "vPjB6nuJFwA1lt4OF-52wTajzcuJmw-ZNYOG0JCMu4g";
let walletConnected = false;
let profileId = null;
let selectedAssetId = null;


async function connectWallet() {
    const connectWalletButton = document.getElementById("connectWalletButton");

    try {
        if (typeof window.arweaveWallet !== 'undefined' && window.arweaveWallet.connect) {
            // Attempt to connect to the Arweave wallet with the required permissions
            await window.arweaveWallet.connect(
                ["ACCESS_ADDRESS", "SIGN_TRANSACTION", "SIGNATURE"],
                {
                    name: "BazAR Asset Platform",
                    logo: "https://arweave.net/your-logo-url",
                }
            );

            // After successful connection, get the active wallet address
            const connectedWallet = await window.arweaveWallet.getActiveAddress();

            if (connectedWallet) {
                walletConnected = true;
                console.log("Wallet connected successfully:", connectedWallet);

                // Update the connect button to reflect the connected state
                connectWalletButton.textContent = `Connected: ${connectedWallet.slice(0, 6)}...${connectedWallet.slice(-4)}`;
                connectWalletButton.style.backgroundColor = "#28a745"; // Green color to indicate success

                await getBazARProfile(); // Fetch the user's BazAR profile once the wallet is connected
            } else {
                // Handle the case where the wallet connection was not successful
                throw new Error("Unable to retrieve the wallet address.");
            }
        } else {
            // Show a message if ArConnect wallet is not available
            showToast("Arweave wallet not found. Please ensure ArConnect is installed and enabled.");
        }
    } catch (error) {
        console.error("Error connecting wallet:", error);
        // Provide feedback to the user if there was an error
        showToast("Failed to connect to Arweave wallet. Please try again.");
    }
}


async function fetchLiveAuctions() {
    try {
        console.log("Fetching live auctions...");

        const signer = createDataItemSigner(window.arweaveWallet);

        // Fetch auction data using a dryrun
        const auctionResponse = await dryrun({
            process: auctionProcessId,
            tags: [
                { name: "Action", value: "Info" }
            ],
            signer: signer
        });

        console.log("Auction info dryrun response:", auctionResponse);

        // Check if we have auction messages
        if (auctionResponse && auctionResponse.Messages && auctionResponse.Messages.length > 0) {
            displayAuctions(auctionResponse.Messages);
        } else {
            console.error("No live auctions available.");
            showToast("No live auctions found.");
        }
    } catch (error) {
        console.error("Error fetching auctions:", error);
    }
}

// Function to dryrun and fetch auction name and image
async function getAuctionDetails(auctionId) {
    try {
        const signer = createDataItemSigner(window.arweaveWallet);

        const auctionDetailsResponse = await dryrun({
            process: auctionId,
            tags: [
                { name: "Action", value: "Info" }
            ],
            signer: signer
        });

        console.log(`Details for auction ${auctionId}:`, auctionDetailsResponse);

        if (auctionDetailsResponse && auctionDetailsResponse.Messages && auctionDetailsResponse.Messages[0]) {
            const auctionData = JSON.parse(auctionDetailsResponse.Messages[0].Data);
            return {
                name: auctionData.Name || auctionId, // Default to auction ID if no name is found
                image: auctionData.Image || "https://via.placeholder.com/150"  // Default image if none is found
            };
        } else {
            return {
                name: auctionId,  // Fallback to auction ID
                image: "https://via.placeholder.com/150"  // Fallback to placeholder image
            };
        }
    } catch (error) {
        console.error(`Error fetching auction details for ${auctionId}:`, error);
        return {
            name: auctionId,
            image: "https://via.placeholder.com/150"
        };
    }
}

async function displayAuctions(auctions) {
    const auctionGrid = document.getElementById('auctionGrid');
    auctionGrid.innerHTML = '';  // Clear previous content

    // Ensure grid layout for the auction grid
    auctionGrid.style.display = 'grid';  
    auctionGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))'; 
    auctionGrid.style.gap = '20px'; 

    // Utility function to truncate seller's address
    const truncateAddress = (address) => {
        return address.length > 10 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address;
    };

    const connectedWallet = await window.arweaveWallet.getActiveAddress();  // Get the connected wallet address only after "Connect Wallet" is clicked

    for (const auction of auctions) {
        const auctionDataTag = auction.Tags.find(tag => tag.name === "Auctions");
        const bidsDataTag = auction.Tags.find(tag => tag.name === "Bids");

        if (!auctionDataTag) {
            console.error("No auction data found in message.");
            continue;
        }

        // Parse the JSON string in the Auctions tag
        const auctionData = JSON.parse(auctionDataTag.value);

        // Loop through all auction keys in the auctionData
        for (const auctionKey in auctionData) {
            const auctionDetails = auctionData[auctionKey]; 
            const assetId = auctionDetails.AssetID;
            const { name: auctionName } = await getAuctionDetails(assetId);

            // Extract auction details
            const seller = auctionDetails.Seller || "Unknown";
            const truncatedSeller = truncateAddress(seller); 
            let minBid = auctionDetails.MinPrice || 0;
            minBid = (minBid / 1e12).toFixed(6);  
            const expiry = auctionDetails.Expiry || "Unknown";

            // Get the current highest bid (if any) from the Bids tag
            let highestBid = "No Bids"; 
            if (bidsDataTag) {
                const bidsData = JSON.parse(bidsDataTag.value)[auctionKey] || [];
                if (bidsData.length > 0) {
                    const highestBidData = bidsData.reduce((max, bid) => (bid.Amount > max.Amount ? bid : max), bidsData[0]);
                    highestBid = (highestBidData.Amount / 1e12).toFixed(6); 
                }
            }

            const auctionImageURL = `https://arweave.net/${assetId}`;

            const auctionThumbnail = document.createElement('div');
            auctionThumbnail.classList.add('auction-thumbnail');
            auctionThumbnail.style.border = '1px solid #ccc'; 
            auctionThumbnail.style.padding = '10px';  
            auctionThumbnail.style.borderRadius = '8px';  

            auctionThumbnail.innerHTML = `
                <img src="${auctionImageURL}" alt="${auctionName}" class="thumbnail-image" style="width: 100%; height: auto; object-fit: cover; border-radius: 5px;">
                <p><strong>${auctionName}</strong></p>
                <p>Current Bid: ${highestBid} wAR</p>
                <p>Seller: ${truncatedSeller}</p>
                <p>Expiry: ${new Date(parseInt(expiry)).toLocaleString()}</p>
            `;

            // Set up onclick event to open auction details
            auctionThumbnail.onclick = () => openAuctionDetails(auctionName, auctionImageURL, minBid, highestBid, seller, expiry, auctionKey, bidsDataTag, connectedWallet);
            auctionGrid.appendChild(auctionThumbnail);
        }
    }
}

// Open auction details modal
async function openAuctionDetails(auctionName, auctionImageURL, minBid, highestBid, seller, expiry, auctionId, bidsDataTag, connectedWallet) {
    const modal = document.getElementById("auctionDetailsModal");

    // Set auction details in the modal
    document.getElementById("auctionName").innerText = auctionName;
    document.getElementById("auctionImage").src = auctionImageURL;
    document.getElementById("minBid").innerText = minBid;
    document.getElementById("currentBid").innerText = highestBid;
    document.getElementById("seller").innerText = seller;
    document.getElementById("expiry").innerText = new Date(parseInt(expiry)).toLocaleString();

    // Show the modal
    modal.style.display = "block";

    // Ensure the cancel button is hidden by default
    const cancelButton = modal.querySelector("#cancelAuctionButton"); // Scoped to modal
    cancelButton.style.display = "none";

    try {
        // Fetch the connected wallet address
        const connectedWalletAddress = await window.arweaveWallet.getActiveAddress();

        // Show the cancel button if the connected wallet matches the seller
        if (connectedWalletAddress === seller) {
            cancelButton.style.display = "inline-block"; // Make the button visible

            // Attach an event listener to the cancel button
            cancelButton.onclick = async () => {
                try {
                    const signer = createDataItemSigner(window.arweaveWallet);

                    // Send the cancel auction message with the correct auction ID
                    const cancelResponse = await message({
                        process: auctionProcessId,  // Auction process ID
                        tags: [
                            { name: "Action", value: "Cancel-Auction" },
                            { name: "AuctionId", value: auctionId }  // Use the correct auction ID
                        ],
                        signer: signer
                    });

                    // Fetch the result and display a success message
                    const resultData = await result({
                        message: cancelResponse,
                        process: auctionProcessId
                    });

                    const successMessage = resultData.Output?.data || "Auction canceled successfully.";
                    showToast(successMessage);
                    await fetchLiveAuctions();  // Refresh the auction list
                    await closeAuctionDetails();  // Close the modal
                } catch (error) {
                    console.error("Error canceling auction:", error);
                    showToast("Error: Failed to cancel the auction.");
                }
            };
        } else {
            cancelButton.style.display = "none";  // Hide if not the seller
        }
    } catch (error) {
        console.error("Error getting connected wallet address:", error);
    }

    // Attach "Place Bid" functionality to the bid button
    const placeBidButton = modal.querySelector(".placeBidButton");
    placeBidButton.onclick = async function () {
        console.log("Bid button clicked!");
    
        const bidAmountInput = modal.querySelector(".bidAmountInput");  // Select the input field
        if (!bidAmountInput) {
            console.error("Bid Amount Input not found.");
            showToast("Error: Bid input field not found.");
            return;
        }
    
        const bidAmount = bidAmountInput.value;  // Access the input value
        console.log("Bid Amount:", bidAmount);  // Log the bid amount for debugging
    
        // Validate the bid amount
        if (parseFloat(bidAmount) < 0.000001) {
            showToast("Bid amount must be at least 0.000001 wAR.");
            return;
        }
    
        // Call the placeBid function
        try {
            await placeBid(auctionId, profileId, auctionProcessId);  // Make sure to pass the correct values
        } catch (error) {
            console.error("Error placing bid:", error);
        }
    };
    
}


async function placeBid(auctionId, bidderProfileId, auctionProcessId) {
    const bidAmountInput = document.querySelector(".bidAmountInput");

    if (!bidAmountInput || parseFloat(bidAmountInput.value) < 0.000001) {
        showToast("Error: Minimum bid is 0.000001 wAR.");
        return;
    }

    const bidAmount = (parseFloat(bidAmountInput.value) * 1e12).toString();  // Convert to 12-decimal format

    try {
        // Step 1: Get the wallet address and store it in a variable
        const walletAddress = await window.arweaveWallet.getActiveAddress();
        const signer = createDataItemSigner(window.arweaveWallet);

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
            closeAuctionDetails()
        } else {
            console.error("No Debit-Notice found.");
            showToast("Error: Bid transfer failed.");
        }
    } catch (error) {
        console.error("Error placing bid:", error);
        showToast("Error placing bid. Please try again.");
    }
}




// Close auction details modal
function closeAuctionDetails() {
    const modal = document.getElementById("auctionDetailsModal");
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
function populateAssetList(assets) {
    const assetList = document.getElementById("assetList");
    assetList.innerHTML = ""; // Clear previous content

    assets.forEach(asset => {
        const option = document.createElement("div");
        option.className = "asset-option";

        option.innerHTML = `
            <img src="${asset.thumbnail}" alt="Thumbnail" style="width: 50px; height: 50px;">
            <span>${asset.title}</span>
        `;

        option.onclick = () => {
            document.querySelector("#assetDropdown .selected").innerHTML = `
                <img src="${asset.thumbnail}" alt="Thumbnail" style="width: 50px; height: 50px;">
                <span>${asset.title}</span>
            `;
            selectedAssetId = asset.id;
            closeModalById("assetSelectionModal");
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

async function listAsset() {
    console.log("List Asset button clicked!");

    const priceInput = document.getElementById("price").value;
    const durationInput = document.getElementById("durationDropdown").value;
    const quantityInput = document.getElementById("quantity").value || 1;

    // Check if we have the necessary data, including the profile ID
    if (!selectedAssetId || !priceInput || !durationInput || !profileId) {
        showToast("Please select an asset, enter price, choose duration, and ensure your profile ID is set.");
        return;
    }

    const minPrice = (priceInput * 1e12).toString(); // Convert price to wAR
    const expiryTimestamp = calculateExpiryTimestamp(durationInput);

    try {
        console.log("Sending Transfer command for NFT...");

        const signer = createDataItemSigner(window.arweaveWallet);

        // Send the Transfer command
        const transferResponse = await message({
            process: profileId,  // Send to the BazAR profile process ID
            tags: [
                { name: "Action", value: "Transfer" },
                { name: "Target", value: selectedAssetId },  // Set the selected asset ID as the target
                { name: "Recipient", value: auctionProcessId },  // Auction process ID
                { name: "Quantity", value: quantityInput.toString() }
            ],
            signer: signer
        });

        console.log("Transfer command sent. Message ID:", transferResponse);

        // Poll for the Transfer-Success message by fetching the results from the profile ID
        console.log("Waiting for Transfer-Success message...");

        const transferSuccess = await pollForTransferSuccess(profileId);
        
        if (transferSuccess) {
            console.log("Transfer-Success received. Proceeding to create auction...");

            await new Promise(resolve => setTimeout(resolve, 2000));

            // Create auction if the transfer was successful
            const auctionResponse = await message({
                process: auctionProcessId,
                tags: [
                    { name: "Action", value: "Create-Auction" },
                    { name: "AuctionId", value: selectedAssetId },  // Use the NFT ID as the Auction ID
                    { name: "MinPrice", value: minPrice },  // Minimum price in wAR
                    { name: "Expiry", value: expiryTimestamp },  // Auction expiry timestamp
                    { name: "Quantity", value: quantityInput.toString() },  // Auction quantity
                    { name: "SellerProfileID", value: profileId }  // Include Seller's BazAR Profile ID
                ],
                signer: signer
            });

            if (auctionResponse) {
                const auctionResultData = await result({
                    message: auctionResponse,  // Use the auction response message ID
                    process: auctionProcessId  // Auction process ID
                });

                const successMessage = auctionResultData.Output?.data || "Auction created successfully.";
                showToast(successMessage);
                await fetchLiveAuctions();  // Refresh auctions
            } else {
                showToast("Error: Auction creation failed.");
            }
        } else {
            showToast("Error: Transfer-Success message not received.");
        }
    } catch (error) {
        console.error("Error listing asset:", error);
        showToast("Error listing asset. Please try again.");
    }
}

// Function to poll the results for Transfer-Success
async function pollForTransferSuccess(profileId) {
    const url = `https://cu.ao-testnet.xyz/results/${profileId}?sort=DESC`;

    try {
        let successFound = false;
        let attempts = 0;

        // Poll for a limited number of attempts (e.g., 5 attempts)
        while (!successFound && attempts < 5) {
            const response = await fetch(url);
            const result = await response.json();

            // Check if Transfer-Success message is in the result
            const transferSuccess = result.edges.find(edge => {
                // Ensure that the edge has Messages and that Messages array is not empty
                if (edge.node.Messages && edge.node.Messages.length > 0) {
                    const messageTags = edge.node.Messages[0].Tags;
                    return messageTags.some(tag => tag.name === "Action" && tag.value === "Transfer-Success");
                }
                return false;
            });

            if (transferSuccess) {
                console.log("Transfer-Success message found:", transferSuccess);
                successFound = true;
                return true;  // Success
            }

            // Wait for a few seconds before polling again
            await new Promise(resolve => setTimeout(resolve, 3000));  // Wait 3 seconds
            attempts++;
        }

        return false;  // Failed to find Transfer-Success message
    } catch (error) {
        console.error("Error polling Transfer-Success:", error);
        return false;
    }
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


document.getElementById('listAssetButton').addEventListener('click', listAsset);

window.connectWallet = connectWallet;
window.listAsset = listAsset;
