local json = require('json')
local sqlite = require('lsqlite3')

Db = Db or sqlite.open_memory()
dbAdmin = require('@rakis/DbAdmin').new(Db)

AuctionHouse = "CxO7svFyjmiK8e5pr19-Y5ieB84pKYNiFq-q078W8bo"
MAX_HISTORY_RECORDS = 2000


Handlers.add('info',
    function(m) return m.Action == "Info" end,
    function(msg)
        -- Fixed: Added empty array parameter for values
        local history = dbAdmin:select([[
            SELECT * FROM HistoryCatalog 
            ORDER BY Expiry DESC;
        ]], {})
        
        Send({
            Target = msg.From,
            History = json.encode(history)
        })
    end
)

function printCatalog()
    local history = dbAdmin:select([[
        SELECT * FROM HistoryCatalog;
    ]], {})
    print(json.encode(history))
end

-- Handler for recording auction history
Handlers.add(
    "RecordAuction",
    -- Only process messages from the authorized auction house with the correct action
    function(m)
        return m.From == AuctionHouse and m.Action == "Record-Auction"
    end,
    function(msg)
        -- Decode the JSON data from the auction house
        local record = json.decode(msg.Data)
        
        if not record then
            print("Error: Failed to decode auction record data")
            return
        end

        -- Insert the record into the history catalog
        dbAdmin:apply([[
            INSERT INTO HistoryCatalog (
                AuctionId,
                AssetID,
                MinPrice,
                Expiry,
                Quantity,
                Seller,
                SellerProfileID,
                Status,
                FinalPrice,
                Winner,
                WinnerProfileID
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        ]], {
            record.AuctionId,
            record.AssetID,
            record.MinPrice,
            record.Expiry,
            record.Quantity,
            record.Seller,
            record.SellerProfileID,
            record.Status,
            record.FinalPrice,
            record.Winner or "NULL",
            record.WinnerProfileID or "NULL"
        })

        print(string.format("Recorded history for auction: %s with status: %s", 
            record.AuctionId, record.Status))
    end
)



-- Handler to trim history records
Handlers.prepend(
    "TrimHistory",
    function(msg)
        return "continue"  -- Process every message, then continue to other handlers
    end,
    function(msg)
        -- Get current count
        local countResult = dbAdmin:select([[
            SELECT COUNT(*) as count FROM HistoryCatalog;
        ]], {})[1]
        
        if not countResult then
            print("Warning: Unable to get history record count")
            return
        end

        local currentCount = countResult.count
        
        if currentCount > MAX_HISTORY_RECORDS then
            -- Calculate how many records to remove
            local recordsToRemove = currentCount - MAX_HISTORY_RECORDS
            
            -- Delete oldest records
            dbAdmin:apply([[
                DELETE FROM HistoryCatalog 
                WHERE EntryIndex IN (
                    SELECT EntryIndex FROM HistoryCatalog 
                    ORDER BY Expiry ASC 
                    LIMIT ?
                );
            ]], {recordsToRemove})
            
            print(string.format("Trimmed %d old records from history. Current count: %d", 
                recordsToRemove, MAX_HISTORY_RECORDS))
        end
    end
)