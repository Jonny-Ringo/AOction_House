auctionProcess = "75aoYp-U8k3VwS1PBnz0y8gVDuj-22rfyPFXDpO0lVo";

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