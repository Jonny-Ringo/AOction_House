local json = require('json')
local sqlite = require('lsqlite3')

-- Initialize SQLite database with proper module names
Db = Db or sqlite.open_memory()
dbAdmin = require('@rakis/DbAdmin').new(Db)

History = "_26RaTB0V3U2AMW2tU-9RxjzuscRW_4qMgRO27ogYa8"
wAR = "xU9zFkq3X2ZQ6olwNVvr1vUWIjc3kXTWr7xKQD6dh10"
feeAccount = "TjXwUoRIxHbvFkkA47eMKehHWoKaRZd9O1JVNBrfbnA"

GlobalAuctionIndex = GlobalAuctionIndex or 0  -- Start as a number to be used in the key

-- Create tables for Auctions, Bids
AUCTIONS = [[
  CREATE TABLE IF NOT EXISTS Auctions (
    AuctionId TEXT PRIMARY KEY,
    AssetID TEXT,
    MinPrice INTEGER,
    Expiry INTEGER,
    Quantity INTEGER,
    Seller TEXT,
    SellerProfileID TEXT
  );
]]

BIDS = [[
  CREATE TABLE IF NOT EXISTS Bids (
    BidId INTEGER PRIMARY KEY AUTOINCREMENT,
    AuctionId TEXT,
    Bidder TEXT,
    Amount INTEGER,
    BidderProfileID TEXT,
    FOREIGN KEY (AuctionId) REFERENCES Auctions(AuctionId)
  );
]]


function InitDb()
    db:exec(AUCTIONS)
    db:exec(BIDS)
    return {"Auctions", "Bids"}
  end

local function announce(msg, pids)
    Utils.map(function(pid)
        Send({Target = pid, Data = msg})
    end, pids)
end

-- Helper function to create unique auction IDs
local function generateAuctionId(assetId)
    GlobalAuctionIndex = GlobalAuctionIndex + 1
    return assetId .. "_" .. tostring(GlobalAuctionIndex)
end

Handlers.add('info',
    function(m) return m.Action == "Info" end,
    function(msg)
        -- For these simple queries with no parameters, we can just pass an empty table
        local auctions = dbAdmin:select([[SELECT * FROM Auctions;]], {})
        local bids = dbAdmin:select([[SELECT * FROM Bids;]], {})
        
        Send({
            Target = msg.From,
            Bids = json.encode(bids),
            Auctions = json.encode(auctions),
        })
    end
)

-- Create Auction Handler
Handlers.add(
    "CreateAuction",
    function(m)
        return m.Action == "Credit-Notice" and m.From ~= wAR
    end,
    function(m)
        local minPrice = tonumber(m.Tags["X-MinPrice"])
        local expiry = tonumber(m.Tags["X-Expiry"])
        local quantity = tonumber(m.Quantity)
        local sellerProfileId = m.Tags["X-SellerProfileID"]
        local seller = m.Tags["X-Seller"]
        local NFT = m.From


        -- Validate inputs with proper error handling
        if not sellerProfileId or sellerProfileId == "" then
            print(string.format("Error: Missing or invalid BazAR Profile ID. Sending NFT back to %s with quantity: %s", m.Sender, quantity))
            Send({
                Target = NFT,
                Action = "Transfer",
                Quantity = tostring(quantity),
                Recipient = m.Sender,
                ["X-Data"] = "Error: Missing or invalid BazAR Profile ID"
            })
            return
        end

        if not minPrice or minPrice <= 0 then
            print(string.format("Error: Invalid or missing minimum price. Sending NFT back to %s with quantity: %s", sellerProfileId, quantity))
            Send({
                Target = NFT,
                Action = "Transfer",
                Quantity = tostring(quantity),
                Recipient = sellerProfileId,
                ["X-Data"] = "Error: Invalid or missing minimum price"
            })
            return
        end

        if not expiry or expiry <= 0 then
            print(string.format("Error: Invalid or missing auction expiry. Sending NFT back to %s with quantity: %s", sellerProfileId, quantity))
            Send({
                Target = NFT,
                Action = "Transfer",
                Quantity = tostring(quantity),
                Recipient = sellerProfileId,
                ["X-Data"] = "Error: Invalid or missing auction end date"
            })
            return
        end

        if not quantity or quantity <= 0 then
            print(string.format("Error: Invalid or missing auction quantity. Sending NFT back to %s with quantity: %s", sellerProfileId, quantity))
            Send({
                Target = NFT,
                Action = "Transfer",
                Quantity = tostring(quantity),
                Recipient = sellerProfileId,
                ["X-Data"] = "Error: Invalid or missing auction quantity"
            })
            return
        end

        local assetId = m.From
        local auctionId = generateAuctionId(assetId)

        -- Insert auction into database
        dbAdmin:exec(string.format([[
            INSERT INTO Auctions (AuctionId, AssetID, MinPrice, Expiry, Quantity, Seller, SellerProfileID)
            VALUES ("%s", "%s", %d, %d, %d, "%s", "%s");
        ]], auctionId, assetId, minPrice, expiry, quantity, seller, sellerProfileId))
        
        print(string.format("Auction created with ID: %s Quantity: %d Expiry: %d", auctionId, quantity, expiry))
        Send({
            Target = seller,
            Data = string.format("Auction created successfully with ID: %s Quantity: %d Expiry: %d", auctionId, quantity, expiry)
        })
    end
)

-- PlaceBid handler
Handlers.add(
    "PlaceBid",
    function(m)
        return m.Action == "Credit-Notice" and m.From == wAR
    end,
    function(m)
        local auctionId = m.Tags["X-AuctionId"]
        local bidderProfileId = m.Tags["X-BidderProfileID"]
        local quantity = tonumber(m.Quantity)
        local bidder = m.Sender

        -- Check for valid payment (bid)
        local bidAmount = quantity
        if not bidAmount or bidAmount <= 0 then
            Send({Target = bidder, Data = "No valid payment found to place bid on auction: " .. auctionId})
            return
        end

        -- Validate auctionId and bidderProfileId
        if not auctionId or auctionId == "" then
            Send({
                Target = wAR,
                Action = "Transfer",
                Recipient = m.Sender,
                Quantity = tostring(bidAmount),
                ["X-Data"] = "Error: Missing auction ID"
            })
            return
        end

        if not bidderProfileId or bidderProfileId == "" then
            Send({
                Target = wAR,
                Action = "Transfer",
                Recipient = m.Sender,
                Quantity = tostring(bidAmount),
                ["X-Data"] = "Error: Missing or invalid BidderProfileID"
            })
            return
        end

        -- Check if auction exists
        local auction = dbAdmin:select([[
            SELECT * FROM Auctions WHERE AuctionId = ?;
        ]], {auctionId})[1]

        if not auction then
            Send({
                Target = wAR,
                Action = "Transfer",
                Recipient = bidder,
                Quantity = tostring(bidAmount),
                ["X-Data"] = "Auction does not exist: " .. auctionId
            })
            return
        end

        -- Check minimum price
        if bidAmount < auction.MinPrice then
            Send({
                Target = wAR,
                Action = "Transfer",
                Recipient = bidder,
                Quantity = tostring(bidAmount),
                ["X-Data"] = "Bid is less than the minimum required bid. Refunding: " .. tostring(bidAmount)
            })
            return
        end

        -- Get highest bid
        local highestBid = dbAdmin:select([[
            SELECT * FROM Bids 
            WHERE AuctionId = ? 
            ORDER BY Amount DESC 
            LIMIT 1;
        ]], {auctionId})[1]

        -- Check if new bid is too low
        if highestBid and bidAmount <= highestBid.Amount then
            Send({
                Target = wAR,
                Action = "Transfer",
                Recipient = bidder,
                Quantity = tostring(bidAmount),
                ["X-Data"] = "Bid is lower than the current highest bid. Refunding: " .. tostring(bidAmount)
            })
            return
        end

        -- Refund previous highest bidder
        if highestBid then
            Send({
                Target = wAR,
                Action = "Transfer",
                Recipient = highestBid.Bidder,
                Quantity = tostring(highestBid.Amount),
                ["X-Data"] = "Refund for previous highest bid on auction: " .. auctionId
            })
            
            -- Remove old bid
            dbAdmin:exec(string.format([[
                DELETE FROM Bids
                WHERE AuctionId = "%s" AND Bidder = "%s";
            ]], auctionId, highestBid.Bidder))
        end

        -- Insert new bid
        dbAdmin:exec(string.format([[
            INSERT INTO Bids (AuctionId, Bidder, Amount, BidderProfileID)
            VALUES ("%s", "%s", %d, "%s");
        ]], auctionId, bidder, bidAmount, bidderProfileId))

        Send({Target = bidder, Data = "Bid placed successfully for auction: " .. auctionId})
    end
)

function finalizeAuction(auctionId, m)
    print("Starting finalization for auction: " .. auctionId)
    
    -- Get auction details first
    local auction = dbAdmin:select([[
        SELECT * FROM Auctions WHERE AuctionId = ?;
    ]], {auctionId})[1]

    if not auction then
        print("Auction " .. auctionId .. " not found in database - skipping")
        return
    end

    local assetId = auction.AssetID

    -- Check for bids first before anything else
    local highestBid = dbAdmin:select([[
        SELECT * FROM Bids WHERE AuctionId = ? ORDER BY Amount DESC LIMIT 1;
    ]], {auctionId})[1]

    if highestBid then
        -- Has winning bid
        print(string.format("Auction won by %s with bid of %d", highestBid.Bidder, highestBid.Amount))
        
        -- Transfer NFT to winner
        Send({
            Target = assetId,
            Action = "Transfer",
            Recipient = highestBid.BidderProfileID,
            Quantity = tostring(auction.Quantity),
            ["X-Data"] = "Won auction: " .. auctionId
        })

        local sellerAmount = math.floor(highestBid.Amount * 0.99)
        local feeAmount = highestBid.Amount - sellerAmount
        
        -- Transfer payment to seller
        Send({
            Target = wAR,
            Action = "Transfer",
            Recipient = auction.Seller,
            Quantity = tostring(sellerAmount),
            ["X-Data"] = "Payment for auction: " .. auctionId
        })
        
        -- Pay auction fee of 1%
        Send({
            Target = wAR,
            Action = "Transfer",
            Recipient = feeAccount,
            Quantity = tostring(feeAmount),
            ["X-Data"] = "Fee for auction: " .. auctionId
        })

        -- Notify parties
        Send({
            Target = auction.Seller,
            Data = string.format("Your auction %s sold for %d wAR", auctionId, highestBid.Amount)
        })
        Send({
            Target = highestBid.Bidder,
            Data = string.format("You won auction %s! The NFT has been transferred to your profile.", auctionId)
        })

        HistoryCatalog(auctionId, "SOLD")
        print("Auction Finalization Complete for SOLD auction: " .. auctionId)

    else
        -- No bids case
        print(string.format("No bids - returning NFT to seller. Asset: %s, Recipient: %s, Quantity: %s", 
            assetId, auction.SellerProfileID, auction.Quantity))
            
        Send({
            Target = assetId,
            Action = "Transfer",
            Recipient = auction.SellerProfileID,
            Quantity = tostring(auction.Quantity),
            ["X-Data"] = "No valid bids, returning NFT to auction: " .. auctionId
        })

        Send({
            Target = auction.Seller,
            Data = "No valid bids for auction: " .. auctionId .. ". NFT returned to seller."
        })

        HistoryCatalog(auctionId, "EXPIRED")
        print("Auction Finalization Complete for EXPIRED auction: " .. auctionId)
    end

    -- Clean up tables
    dbAdmin:exec(string.format([[DELETE FROM Bids WHERE AuctionId = "%s";]], auctionId))
    dbAdmin:exec(string.format([[DELETE FROM Auctions WHERE AuctionId = "%s";]], auctionId))
    
    print("Auction removed from Tables: " .. auctionId)
end

-- Finalize Auction Handler remains the same
Handlers.prepend(
    "FinalizeAuction",
    function(msg)
        return "continue"
    end,
    function(msg)
        -- Check if tables exist first
        local tables = dbAdmin:tables()
        local hasAuctions = false
        for _, tableName in ipairs(tables) do
            if tableName == "Auctions" then
                hasAuctions = true
                break
            end
        end
        
        if not hasAuctions then
            print("No Auctions table found")
            return
        end

        local currentTime = tonumber(msg.Timestamp)
        if not currentTime then
            print("Warning: Invalid timestamp in message")
            return
        end

        -- Get expired auctions with additional logging
        print("Checking for expired auctions at time: " .. currentTime)
        
        local expiredAuctions = dbAdmin:select([[
            SELECT AuctionId FROM Auctions 
            WHERE Expiry <= ?;
        ]], {currentTime})

        if #expiredAuctions == 0 then
            print("No expired auctions found")
            return
        end

        print("Found " .. #expiredAuctions .. " expired auctions")

        -- Process each expired auction
        for _, auction in ipairs(expiredAuctions) do
            finalizeAuction(auction.AuctionId, msg)
        end
    end
)

-- Cancel Auction Handler
Handlers.add('CancelAuction', 
    function(m) 
        return m.Action == "Cancel-Auction" 
    end, 
    function(m)
        local auctionId = m.AuctionId
        if not auctionId or auctionId == "" then
            print("Error: Missing auction ID")
            Send({Target = m.From, Data = "Error: Missing auction ID for cancel request."})
            return
        end

        local requester = m.From

        -- Get auction
        local auction = dbAdmin:select([[
            SELECT * FROM Auctions WHERE AuctionId = ?;
        ]], {auctionId})[1]

        if not auction then
            print("Auction does not exist: " .. auctionId)
            Send({Target = requester, Data = "Error: Auction does not exist: " .. auctionId})
            return
        end

        -- Check ownership
        if auction.Seller ~= requester then
            print("Unauthorized cancel attempt by: " .. requester)
            Send({Target = requester, Data = "Error: You are not authorized to cancel this auction."})
            return
        end

        -- Check for bids
        local bidsCount = dbAdmin:select([[
            SELECT COUNT(*) as count FROM Bids WHERE AuctionId = ?;
        ]], {auctionId})[1].count

        if bidsCount > 0 then
            print("Cancel attempt failed. Bids exist for auction: " .. auctionId)
            Send({Target = requester, Data = "Error: Auction has active bids and cannot be canceled."})
            return
        end

        -- Return NFT to seller
        Send({
            Target = auction.AssetID,
            Action = "Transfer",
            Recipient = auction.SellerProfileID,
            Quantity = tostring(auction.Quantity),
            ["X-Data"] = "Auction canceled, NFT(s) refunded to seller profile."
        })

        -- Delete auction
        dbAdmin:exec(string.format([[
            DELETE FROM Auctions WHERE AuctionId = "%s";
        ]], auctionId))

        print("Auction canceled: " .. auctionId)
        Send({Target = requester, Data = "Auction canceled successfully: " .. auctionId .. " and NFT(s) refunded."})
    end
)

-- Helper function to catalog completed auctions
function HistoryCatalog(auctionId, status)
    -- Get full auction details
    local auction = dbAdmin:select([[
        SELECT * FROM Auctions WHERE AuctionId = ?;
    ]], {auctionId})[1]

    if not auction then
        print("Warning: Unable to catalog auction history - auction not found: " .. auctionId)
        return
    end

    -- Get winning bid if exists
    local winningBid = dbAdmin:select([[
        SELECT * FROM Bids 
        WHERE AuctionId = ? 
        ORDER BY Amount DESC 
        LIMIT 1;
    ]], {auctionId})[1]

    -- Set bid-related values
    local finalPrice = 0
    local winner = nil
    local winnerProfileId = nil
    
    if winningBid then
        finalPrice = winningBid.Amount
        winner = winningBid.Bidder
        winnerProfileId = winningBid.BidderProfileID
    end

    -- Prepare history record
    local historyRecord = {
        AuctionId = auction.AuctionId,
        AssetID = auction.AssetID,
        MinPrice = auction.MinPrice,
        Expiry = auction.Expiry,
        Quantity = auction.Quantity,
        Seller = auction.Seller,
        SellerProfileID = auction.SellerProfileID,
        Status = status,
        FinalPrice = finalPrice,
        Winner = winner,
        WinnerProfileID = winnerProfileId
    }

    -- Send to History process
    Send({
        Target = History,
        Action = "Record-Auction",
        Data = json.encode(historyRecord)
    })
    
    print("Auction history recorded for: " .. auctionId .. " with status: " .. status)
end





--Master function to cancel aucitons and refund NFTs/bids
function masterCancel(auctionId)

    -- Get auction details
    local auction = dbAdmin:select([[
        SELECT * FROM Auctions WHERE AuctionId = ?;
    ]], {auctionId})[1]

    if not auction then
        print("Error: Auction not found: " .. auctionId)
        return
    end

    -- Check for highest bid first
    local highestBid = dbAdmin:select([[
        SELECT * FROM Bids 
        WHERE AuctionId = ? 
        ORDER BY Amount DESC 
        LIMIT 1;
    ]], {auctionId})[1]

    -- Return NFT to seller
    Send({
        Target = auction.AssetID,
        Action = "Transfer",
        Recipient = auction.SellerProfileID,
        Quantity = tostring(auction.Quantity),
        ["X-Data"] = "Auction force cancelled by owner, NFT returned"
    })

    print(string.format("NFT returned to seller profile %s with quantity %s", 
        auction.SellerProfileID, 
        auction.Quantity
    ))

    -- If there was a bid, refund it
    if highestBid then
        Send({
            Target = wAR,
            Action = "Transfer",
            Recipient = highestBid.Bidder,
            Quantity = tostring(highestBid.Amount),
            ["X-Data"] = "Refund for cancelled auction: " .. auctionId
        })

        print(string.format("Bid refunded to bidder %s with amount %s wAR", 
            highestBid.Bidder,
            highestBid.Amount
        ))
    else
        print("No active bids to refund")
    end

    -- Clean up the database
    dbAdmin:exec(string.format([[DELETE FROM Bids WHERE AuctionId = "%s";]], auctionId))
    dbAdmin:exec(string.format([[DELETE FROM Auctions WHERE AuctionId = "%s";]], auctionId))

    print("Auction " .. auctionId .. " has been fully cancelled and removed from database")
end