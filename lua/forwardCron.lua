auctionProcess = "w1HOBDLHByEPTVTdny3XzbWk6R6FAz9h0KQgDBdrP1w"

Handlers.add(
    "ForwardCron",
    function(m)
        return m.Action == "Cron"
    end,
    function(m)
        Send({
            Target = auctionProcess,
            Action = "Cron"
        })
    end
)