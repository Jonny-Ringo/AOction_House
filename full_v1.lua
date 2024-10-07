local json = require('json')

wAR = "xU9zFkq3X2ZQ6olwNVvr1vUWIjc3kXTWr7xKQD6dh10"
Auctions = Auctions or {}
Bids = Bids or {}
Payments = Payments or {}
Transfers = Transfers or {}
GlobalAuctionIndex = GlobalAuctionIndex or 0  -- Start as a number to be used in the key

local function announce(msg, pids)
    Utils.map(function(pid)
        Send({Target = pid, Data = msg})
    end, pids)
end

-- Helper function to create unique auction IDs
local function generateAuctionId(assetId)
    GlobalAuctionIndex = GlobalAuctionIndex + 1
    return assetId .. "_" .. tostring(GlobalAuctionIndex)  -- New format AssetID_Index
end

Handlers.add('info',
    function(m) return m.Action == "Info" end,
    function(msg)
        local bidsJson = json.encode(Bids)
        local auctionsJson = json.encode(Auctions)
      
        Send({
            Target = msg.From,
            Bids = bidsJson,
            Auctions = auctionsJson,
        })
    end
)

-- Payment Received Handler
Handlers.add(
    "PaymentReceived",
    function(m)
        return m.Action == "Credit-Notice" and m.From == wAR
    end,
    function(m)
        local payer = m.Sender

        if not payer then
            print("Error: Could not determine the payer's address")
            return
        end

        Payments[payer] = Payments[payer] or 0
        Payments[payer] = Payments[payer] + tonumber(m.Quantity)

        -- Send a confirmation message
        print("Payment received from: " .. payer .. " of amount: " .. m.Quantity)
        Send({Target = payer, Data = "Payment received for " .. m.Quantity .. " wAR."})
    end
)

-- Credit-Notice Handler for NFTs
Handlers.add(
    "NFTTransferReceived",
    function(m)
        return m.Action == "Credit-Notice" and m.From ~= wAR
    end,
    function(m)
        local assetId = m.From  -- Use m.From as the Asset ID (NFT process ID)
        local sender = m.Sender   -- Sender of the NFT

        -- Record the transfer details in the Transfers table
        Transfers[assetId] = {
            Sender = sender,
            Quantity = tonumber(m.Quantity)  -- Store the quantity of NFTs being transferred
        }

        -- Log the event
        print("NFT transferred from " .. sender .. " to auction house. Asset ID: " .. assetId .. ", Quantity: " .. m.Quantity)

        -- Send a confirmation message to the sender
        Send({Target = sender, Action = "Transfer Received", Data = "NFT: " .. assetId})
    end
)

-- Auction Creation Handler with SellerProfileID and unique auction key
Handlers.add(
    "CreateAuction",
    function(m)
        return m.Action == "Create-Auction"
    end,
    function(m)
        local assetId = m.AuctionId  -- This is now treated as the AssetID
        local minPrice = tonumber(m.MinPrice)
        local expiry = tonumber(m.Expiry)
        local quantity = tonumber(m.Quantity)
        local sellerProfileId = m.SellerProfileID  -- The seller's Bazar profile address

        -- Validate inputs
        if not assetId or assetId == "" then
            Send({Target = m.From, Data = "Error: Missing asset ID"})
            return
        end
        if not sellerProfileId or sellerProfileId == "" then
            Send({Target = m.From, Data = "Error: Missing or invalid SellerProfileID"})
            return
        end
        if not minPrice or minPrice <= 0 then
            Send({Target = m.From, Data = "Error: Invalid or missing minimum price"})
            return
        end
        if not expiry or expiry <= 0 then
            Send({Target = m.From, Data = "Error: Invalid or missing auction expiry"})
            return
        end
        if not quantity or quantity <= 0 then
            Send({Target = m.From, Data = "Error: Invalid or missing auction quantity"})
            return
        end

        -- Check for NFT transfer for this asset
        if not Transfers[assetId] or Transfers[assetId].Sender ~= m.SellerProfileID then
            Send({Target = m.From, Data = "Error: No NFT transfer found for this asset or unauthorized to create."})
            return
        end

        -- Generate a unique auction ID using the AssetID and GlobalAuctionIndex
        local auctionId = generateAuctionId(assetId)

        -- Create the auction with validated data and SellerProfileID
        Auctions[auctionId] = {
            AssetID = assetId,           -- Store the AssetID for reference
            MinPrice = minPrice,
            Expiry = expiry,
            Quantity = quantity,
            Seller = m.From,             -- Record the seller's address
            SellerProfileID = sellerProfileId  -- Add SellerProfileID
        }
        
        Transfers[assetId] = nil
        print("Auction created with ID: " .. auctionId)
        Send({Target = m.From, Data = "Auction created successfully with ID: " .. auctionId})
    end
)

Handlers.add(
    "PlaceBid",
    function(m)
        return m.Action == "Place-Bid"
    end,
    function(m)
        local auctionId = m.AuctionId
        local bidderProfileId = m.BidderProfileID
        local bidder = m.From

        -- Check for valid payment (bid)
        local bidAmount = Payments[bidder]
        if not bidAmount or bidAmount <= 0 then
            Send({Target = bidder, Data = "No valid payment found to place bid on auction: " .. auctionId})
            return
        end

        -- Validate auctionId and bidderProfileId
        if not auctionId or auctionId == "" then
            Send({Target = m.From, Data = "Error: Missing auction ID"})
            Send({
                Target = wAR,
                Action = "Transfer",
                Recipient = m.From,
                Quantity = tostring(bidAmount),
            })
            Payments[m.From] = nil
            return
        end

        if not bidderProfileId or bidderProfileId == "" then
            Send({Target = m.From, Data = "Error: Missing or invalid BidderProfileID"})
            Send({
                Target = wAR,
                Action = "Transfer",
                Recipient = m.From,
                Quantity = tostring(bidAmount),
            })
            Payments[m.From] = nil
            return
        end

        -- Ensure the auction exists before checking the minimum price
        local auction = Auctions[auctionId]
        if not auction then
            Send({Target = bidder, Data = "Auction does not exist: " .. auctionId})
            Send({
                Target = wAR,
                Action = "Transfer",
                Recipient = bidder,
                Quantity = tostring(bidAmount),
            })
            Payments[bidder] = nil
            return
        end

        local minPrice = auction.MinPrice

        -- Check if the bid is at least the minimum price
        if bidAmount < minPrice then
            Send({
                Target = wAR,
                Action = "Transfer",
                Recipient = bidder,
                Quantity = tostring(bidAmount),
            })
            Send({Target = bidder, Data = "Bid is less than the minimum required bid. Refunding: " .. tostring(bidAmount)})
            Payments[bidder] = nil
            return
        end

        -- Get the highest current bid for this auction
        Bids[auctionId] = Bids[auctionId] or {}
        local highestBid = nil
        local highestBidIndex = nil
        for i, bid in ipairs(Bids[auctionId]) do
            if not highestBid or bid.Amount > highestBid.Amount then
                highestBid = bid
                highestBidIndex = i
            end
        end

        -- Check if the new bid is lower than the highest bid
        if highestBid and bidAmount <= highestBid.Amount then
            Send({
                Target = wAR,
                Action = "Transfer",
                Recipient = bidder,
                Quantity = tostring(bidAmount),
                Data = "Bid is lower than the current highest bid. Refunding."
            })
            Send({Target = bidder, Data = "Bid is lower than the current highest bid. Refunding: " .. tostring(bidAmount)})
            Payments[bidder] = nil
            return
        end

        -- Refund the previous highest bid if necessary
        if highestBid then
            Send({
                Target = wAR,
                Action = "Transfer",
                Recipient = highestBid.Bidder,
                Quantity = tostring(highestBid.Amount),
                Data = "Refund for previous highest bid on auction: " .. auctionId
            })
            table.remove(Bids[auctionId], highestBidIndex)
        end

        -- Place the new bid
        table.insert(Bids[auctionId], {Bidder = bidder, Amount = bidAmount, BidderProfileID = bidderProfileId})
        Payments[bidder] = nil

        Send({Target = bidder, Data = "Bid placed successfully for auction: " .. auctionId})
    end
)



-- Finalize Auction Function with BidderProfileID
function finalizeAuction(auctionId, m)
    if not Auctions[auctionId] then
        Send({Target = m.From, Data = "Auction does not exist: " .. auctionId})
        return
    end

    print("Finalizing auction: " .. auctionId)

    -- Find the highest bid
    local highestBid = nil
    if Bids[auctionId] then
        for _, bid in ipairs(Bids[auctionId]) do
            if not highestBid or bid.Amount > highestBid.Amount then
                highestBid = bid
            end
        end
    end

    if highestBid then
        print("Highest bidder for auction: " .. highestBid.Bidder)

        -- Transfer NFT to the highest bidder's profile address (BidderProfileID)
        Send({
            Target = Auctions[auctionId].AssetID,
            Action = "Transfer",
            Recipient = highestBid.BidderProfileID,  -- Use BidderProfileID to transfer the NFT
            Quantity = tostring(Auctions[auctionId].Quantity),
            Data = "NFT won in auction: " .. auctionId
        })

        -- Transfer bid amount to the seller
        Send({
            Target = wAR,
            Action = "Transfer",
            Recipient = Auctions[auctionId].Seller,
            Quantity = tostring(highestBid.Amount),
            Data = "Payment for auction: " .. auctionId
        })

        -- Refund other bidders
        for _, bid in ipairs(Bids[auctionId]) do
            if bid.Bidder ~= highestBid.Bidder then
                Send({
                    Target = wAR,
                    Action = "Transfer",
                    Recipient = bid.Bidder,
                    Quantity = tostring(bid.Amount),
                    Data = "Refund for auction: " .. auctionId
                })
            end
        end

        print("Auction finalized: " .. auctionId)
        Send({Target = m.From, Data = "Auction finalized: " .. auctionId})
    else
        -- No valid bids were found, return the NFT to the original seller's profile address (SellerProfileID)
        print("No valid bids found for auction: " .. auctionId)
        Send({
            Target = Auctions[auctionId].AssetID,
            Action = "Transfer",
            Recipient = Auctions[auctionId].SellerProfileID,  -- Use SellerProfileID to return NFT to the seller
            Quantity = tostring(Auctions[auctionId].Quantity),
            Data = "No valid bids, returning NFT to seller for auction: " .. auctionId
        })

        Send({Target = Auctions[auctionId].Seller, Data = "No valid bids for auction: " .. auctionId .. ". NFT returned to seller."})
    end

    -- Clean up auction and bids
    Auctions[auctionId] = nil
    Bids[auctionId] = nil
end

-- Finalize Auction Handler
Handlers.prepend(
    "FinalizeAuction",
    function(msg)
        return "continue"
    end,
    function(msg)
        local currentTime = tonumber(msg.Timestamp)

        -- Process auctions
        for auctionId, auctionData in pairs(Auctions) do
            if currentTime >= auctionData.Expiry then
                finalizeAuction(auctionId, msg)
            end
        end
    end
)

-- Cancel Auction Handler with SellerProfileID
Handlers.add('CancelAuction', 
    function(m) 
        return m.Action == "Cancel-Auction" 
    end, 
    function(m)
        -- Check if the auctionId is provided
        local auctionId = m.AuctionId
        if not auctionId or auctionId == "" then
            print("Error: Missing auction ID")
            Send({Target = m.From, Data = "Error: Missing auction ID for cancel request."})
            return
        end

        local requester = m.From

        -- Check if the auction exists
        if not Auctions[auctionId] then
            print("Auction does not exist: " .. auctionId)
            Send({Target = requester, Data = "Error: Auction does not exist: " .. auctionId})
            return
        end

        -- Check if the requester is the owner of the auction
        if Auctions[auctionId].Seller ~= requester then
            print("Unauthorized cancel attempt by: " .. requester)
            Send({Target = requester, Data = "Error: You are not authorized to cancel this auction."})
            return
        end

        -- Check if there are any bids for this auction
        if Bids[auctionId] and #Bids[auctionId] > 0 then
            print("Cancel attempt failed. Bids exist for auction: " .. auctionId)
            Send({Target = requester, Data = "Error: Auction has active bids and cannot be canceled."})
            return
        end

        -- Retrieve the quantity of the asset before canceling
        local quantity = Auctions[auctionId].Quantity

        -- Refund the NFT(s) to the seller's profile address (SellerProfileID)
        Send({
            Target = Auctions[auctionId].AssetID,  -- The AssetId is the process ID of the NFT
            Action = "Transfer",
            Recipient = Auctions[auctionId].SellerProfileID,  -- Send it back to the seller's profile
            Quantity = tostring(quantity),  -- Use the quantity from the Auctions table
            Data = "Auction canceled, NFT(s) refunded to seller profile."
        })

        -- Cancel the auction
        Auctions[auctionId] = nil
        print("Auction canceled: " .. auctionId)

        Send({Target = requester, Data = "Auction canceled successfully: " .. auctionId .. " and NFT(s) refunded."})
    end
)
