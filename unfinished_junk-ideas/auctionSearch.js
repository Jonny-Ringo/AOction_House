import { getAuctionDetails, displayAuctions, fetchLiveAuctions,allLiveAuctions, currentDisplayedAuctions, auctionPage,
    totalAuctionPages, auctionsPerPage } from './AH.js';

// Add event listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchButton').addEventListener('click', performSearch);
    document.getElementById('auctionSearch').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
});



async function performSearch() {
    const searchTerm = document.getElementById('auctionSearch').value.toLowerCase().trim();

    if (!searchTerm) {
        currentDisplayedAuctions = null; // This updates the imported reference
        auctionPage = 1;
        await fetchLiveAuctions();
        return;
    }

    const filteredAuctions = await Promise.all(
        allLiveAuctions.map(async (auction) => {
            const { name } = await getAuctionDetails(auction.auctionId, auction.AssetID);
            const auctionName = name ? name.toLowerCase() : '';

            return {
                matches:
                    auction.auctionId.toLowerCase().includes(searchTerm) ||
                    auctionName.includes(searchTerm),
                auction: auction,
                name: name,
            };
        })
    );

    const matchedAuctions = filteredAuctions
        .filter((result) => result.matches)
        .map((result) => ({ ...result.auction, name: result.name }));

    currentDisplayedAuctions = matchedAuctions; // Updates the shared state
    auctionPage = 1;
    totalAuctionPages = Math.ceil(matchedAuctions.length / auctionsPerPage);

    if (matchedAuctions.length === 0) {
        const auctionGrid = document.getElementById('auctionGrid');
        auctionGrid.innerHTML = '<p class="no-results">No matching auctions found</p>';
        document.getElementById('paginationControls').innerHTML = '';
    } else {
        displayAuctions(1, matchedAuctions);
    }
}