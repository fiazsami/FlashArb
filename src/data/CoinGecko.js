const Resource = require("../util/Resource");

class CoinGecko {
    static async getPrice(id) {
        let rsrc = new Resource(
            "https://api.coingecko.com/api/v3/simple/price"
        );
        rsrc.param("ids", id);
        rsrc.param("vs_currencies", "usd");
        return await rsrc.get();
    }
}

module.exports = CoinGecko;
