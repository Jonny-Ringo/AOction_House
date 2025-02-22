auctionProcess = "xKzMOikgxWcz3SjxwKJwrI5D5jkl2eY5_n8k0WL4s2c"

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