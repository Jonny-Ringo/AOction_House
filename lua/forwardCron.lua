auctionProcess = "CxO7svFyjmiK8e5pr19-Y5ieB84pKYNiFq-q078W8bo"

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