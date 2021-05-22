require("dotenv").config();

const Web3 = require("web3");
const web3 = new Web3(
    new Web3.providers.WebsocketProvider(process.env.INFURA_URL)
);

const { ChainId, Token, TokenAmount, Pair } = require("@uniswap/sdk");

const abis = require("../config/abis");
const { mainnet: addresses } = require("../config/addresses");
const kyber = new web3.eth.Contract(
    abis.kyber.kyberNetworkProxy,
    addresses.kyber.kyberNetworkProxy
);

const CoinGecko = require("../data/CoinGecko");

const AMOUNT_ETH = 10;
const ETH_CONTRACT = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

async function quantityFor(amount) {
    let response = await CoinGecko.getPrice("ethereum");
    let price = response.data.ethereum.usd;
    return {
        amount,
        ethWei: web3.utils.toWei(amount.toString()),
        daiWei: web3.utils.toWei((amount * price).toString()),
    };
}

async function getKyberQuote() {
    const quote = await Promise.all([
        kyber.methods
            .getExpectedRate(
                addresses.tokens.dai,
                ETH_CONTRACT,
                QUANTITY.daiWei
            )
            .call(),
        kyber.methods
            .getExpectedRate(
                ETH_CONTRACT,
                addresses.tokens.dai,
                QUANTITY.ethWei
            )
            .call(),
    ]);

    const buy = 10 ** 18 / quote[0].expectedRate;
    const sell = quote[1].expectedRate / 10 ** 18;
    return {
        buy,
        sell,
        spread: buy - sell,
    };
}

async function getUniswapPair() {
    try {
        const daiWeth = await Pair.fetchData(DAI_TOKEN, WETH_TOKEN);
        return {
            dai: DAI_TOKEN,
            weth: WETH_TOKEN,
            daiWeth,
        };
    } catch (err) {
        console.log("ERROR: getUniswapPair");
    }
    return null;
}

async function getUniswapQuote() {
    const pair = await getUniswapPair();
    if (pair !== null) {
        try {
            const quote = await Promise.all([
                pair.daiWeth.getOutputAmount(
                    new TokenAmount(pair.dai, QUANTITY.daiWei)
                ),
                pair.daiWeth.getOutputAmount(
                    new TokenAmount(pair.weth, QUANTITY.ethWei)
                ),
            ]);

            const buy = parseFloat(
                QUANTITY.daiWei / quote[0][0].toExact() / 10 ** 18
            );
            const sell = parseFloat(quote[1][0].toExact() / QUANTITY.amount);
            return {
                buy,
                sell,
                spread: buy - sell,
            };
        } catch (err) {
            console.log("ERROR: getUniswapQuote");
            console.log(err);
        }
    }

    return null;
}

async function checkArb(block) {
    let kQuote = await getKyberQuote();
    let uQuote = await getUniswapQuote();

    if (kQuote !== null && uQuote !== null) {
        const gasPrice = await web3.eth.getGasPrice();
        const txCost = 200000 * parseInt(gasPrice);
        const currentEthPrice = (uQuote.buy + uQuote.sell) / 2;

        const profit1 =
            (parseInt(QUANTITY.ethWei) / 10 ** 18) *
                (uQuote.sell - kQuote.buy) -
            (txCost / 10 ** 18) * currentEthPrice;
        const profit2 =
            (parseInt(QUANTITY.ethWei) / 10 ** 18) *
                (kQuote.sell - uQuote.buy) -
            (txCost / 10 ** 18) * currentEthPrice;
        if (profit1 > 0) {
            console.log(`Block [ ${block.number} ]`);
            console.log("Arb opportunity found!");
            console.log(`Buy ETH on Kyber at ${kQuote.buy} dai`);
            console.log(`Sell ETH on Uniswap at ${uQuote.sell} dai`);
            console.log(`Expected profit: ${profit1} dai`);
            console.log("-".repeat(40));
        } else if (profit2 > 0) {
            console.log(`Block [ ${block.number} ]`);
            console.log("Arb opportunity found!");
            console.log(`Buy ETH from Uniswap at ${uQuote.buy} dai`);
            console.log(`Sell ETH from Kyber at ${kQuote.sell} dai`);
            console.log(`Expected profit: ${profit2} dai`);
            console.log("-".repeat(40));
        }
    } else {
        console.log("ERROR: checkArb");
        console.log("-".repeat(40));
    }
}

let DAI_TOKEN = null;
let WETH_TOKEN = null;
let QUANTITY = null;

async function init() {
    QUANTITY = await quantityFor(AMOUNT_ETH);

    [DAI_TOKEN, WETH_TOKEN] = await Promise.all(
        [addresses.tokens.dai, addresses.tokens.weth].map((tokenAddr) =>
            Token.fetchData(ChainId.MAINNET, tokenAddr)
        )
    );
}

async function main() {
    web3.eth
        .subscribe("newBlockHeaders")
        .on("data", async (block) => {
            try {
                checkArb(block);
            } catch (err) {
                console.log(err);
            }
        })
        .on("error", (error) => {
            console.log(error);
        });
}

init();
main();
