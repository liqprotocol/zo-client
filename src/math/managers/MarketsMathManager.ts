import { Num, State, Zo, ZO_DEX_PROGRAM_ID, ZoMarket } from "@zero_one/client"
import { ONE, STATE_KEY, ZERO } from "../../../config/config"
import { Connection, PublicKey } from "@solana/web3.js"
import { GeneralMarketInfoIState } from "../../components/markets/state/marketsState"
import Decimal from "decimal.js"
import { MarketType } from "../../components/markets/state/marketType"
import _ from "lodash"
import { ActiveOrder } from "../../components/activeOrders/state/activeOrdersState"
import { Program } from "@project-serum/anchor"
import { GeneralAssetInfoIState } from "../../components/balances/state/balancesState"
import { FuturesMarketMetas } from "../../../components/constants/MarketMetas"

export const MARKET_KEYS = []

export class MarketsMathManager {
  state: State
  dexMarket: ZoMarket
  fundingHistory: { [key: string]: any[] } = {}
  dexMarkets = {}

  constructor({ state: state }) {
    this.state = state
  }

  static async load(program: Program<Zo>) {
    const state = await State.load(program, STATE_KEY)
    const mm = new MarketsManager({
      state: state,
    })
    return mm
  }

  static _getMarketType(perpType) {
    if (_.isEqual(perpType, { future: {} })) {
      return MarketType.Perp
    } else if (_.isEqual(perpType, { callOption: {} })) {
      return MarketType.EverCall
    } else if (_.isEqual(perpType, { putOption: {} })) {
      return MarketType.EverPut
    }
    return MarketType.Perp
  }


  loadAssets() {
    const assets: { [key: string]: GeneralAssetInfoIState } = {}
    let index = 0

    for (const collateral of this.state.data.collaterals) {
      const supply =
        this.state.cache.data.borrowCache[index].actualSupply.decimal
      const borrows =
        this.state.cache.data.borrowCache[index].actualBorrows.decimal
      const utilization = supply.greaterThanOrEqualTo(ONE.decimal())
        ? borrows.div(supply)
        : ZERO.decimal()
      const optimalUtility = new Decimal(collateral.optimalUtil.toString())
      const optimalRate = new Decimal(collateral.optimalRate.toString())
      const maxRate = new Decimal(collateral.maxRate.toString())
      let ir
      if (utilization.mul(1000).greaterThan(optimalUtility)) {
        const extraUtil = utilization.mul(1000).sub(optimalUtility)
        const slope = maxRate
          .sub(optimalRate)
          .div(new Decimal(1000).sub(optimalUtility))
        ir = optimalRate.add(slope.mul(extraUtil)).div(1000)
      } else {
        ir = optimalRate.div(optimalUtility).mul(utilization)
      }
      const borrowApy = ir.mul(100)
      const supplyApy = ir.mul(utilization).mul(100)
      const price = this.state.cache.getOracleBySymbol(
        collateral.oracleSymbol,
      ).price

      assets[collateral.oracleSymbol] = {
        ...collateral,
        symbol: collateral.oracleSymbol,
        indexPrice: price,
        vault: this.state.data.vaults[index],
        supply: this.state.cache.data.borrowCache[index].actualSupply.decimal,
        borrows: this.state.cache.data.borrowCache[index].actualBorrows.decimal,
        supplyApy: supplyApy,
        borrowsApy: borrowApy,
        //future: handle shib type assets
        uiDigits: Math.max(2, Math.floor(Math.log10(price.number)) + 1),
        uiPriceDigits: Math.max(2, Math.ceil(Math.log10(1 / price.number)) + 3),
      }

      index++
    }
    return assets
  }

  async loadMarkets(connection: Connection) {
    const markets = {}
    let index = 0
    const coingeckoIds = this.state.data.perpMarkets.reduce((str, market) => {
      str += FuturesMarketMetas(market.symbol).coingeckoId + "%2C"
      return str
    }, "")
    let dailyChanges
    try {
      dailyChanges = await (
        await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=" +
          coingeckoIds +
          "&vs_currencies=usd&include_24hr_change=true",
        )
      ).json()
    } catch (_) {
    }
    for (const perpMarket of this.state.data.perpMarkets) {
      let volume = 0
      try {
        volume = (
          await (
            await fetch(
              "https://tradingview.01.xyz/volume?symbol=" + perpMarket.symbol,
            )
          ).json()
        )["v"]
      } catch (_) {
      }
      let dailyChange = 0
      try {

        dailyChange =
          dailyChanges[FuturesMarketMetas(perpMarket.symbol).coingeckoId][
            "usd_24h_change"
            ]
      } catch (_) {
      }
      const marketType = MarketsManager._getMarketType(perpMarket.perpType)
      const price = this.state.cache.getOracleBySymbol(
        perpMarket.oracleSymbol,
      ).price
      markets[perpMarket.symbol] = {
        symbol: perpMarket.symbol,
        pubKey: perpMarket.dexMarket,
        volume: volume,
        openInterest: await this.getOpenInterest(
          perpMarket.dexMarket,
          connection,
          perpMarket.assetDecimals,
        ),
        //todo: everlasting price adjustment
        indexPrice: price,
        markPrice: this.state.cache.data.marks[index].price,
        baseImf: new Decimal(perpMarket.baseImf / BASE_IMF_DIVIDER),
        pmmf: new Decimal(
          perpMarket.baseImf / BASE_IMF_DIVIDER / MMF_MULTIPLIER,
        ),
        fundingIndex: new Num(
          this.state.cache.data.fundingCache[index],
          USD_DECIMALS,
        ).decimal,

        dailyChange: dailyChange,
        marketType: marketType,
        assetDecimals: perpMarket.assetDecimals,
        assetLotSize:
          Math.round(Math.log(new Num(perpMarket.assetLotSize, 0).number) / Math.log(10)),
        quoteLotSize:
          Math.round(Math.log(new Num(perpMarket.quoteLotSize, 0).number) / Math.log(10)),
        strike: new Num(perpMarket.strike, USD_DECIMALS).number,
        //future: handle shib type assets
        uiDigits: Math.max(2, Math.floor(Math.log10(price.number)) + 1),
        uiPriceDigits: Math.max(2, Math.ceil(Math.log10(1 / price.number)) + 3),
      }
      index++
    }

    return markets
  }

  async getOpenInterest(
    marketPubKey: PublicKey,
    connection: Connection,
    decimals,
  ) {
    const dexMarket = await this.loadDexMarket(connection, marketPubKey)
    return dexMarket._decoded.openInterest.toNumber() / Math.pow(10, decimals)
  }

  async getActiveOrders(
    market: GeneralMarketInfoIState,
    controlKey: PublicKey,
    connection: Connection,
  ) {
    const orders: ActiveOrder[] = []
    const dexMarket = await this.loadDexMarket(connection, market.pubKey)
    const bids = await dexMarket.loadBids(connection, "recent")
    const asks = await dexMarket.loadAsks(connection, "recent")
    const activeOrders = dexMarket.filterForOpenOrders(bids, asks, controlKey)
    for (const order of activeOrders) {
      orders.push({
        price: new Num(order.price, USD_DECIMALS),
        coins: new Num(Math.abs(order.size), market.assetDecimals),
        pCoins: new Num(Math.abs(order.size * order.price), USD_DECIMALS),
        orderId: order.orderId,
        marketKey: market.symbol,
        long: order.side == "buy",
        symbol: market.symbol,
      })
    }
    return orders
  }

  getIndexToMarketKey() {
    const index = []
    for (const perpMarket of this.state.data.perpMarkets) {
      index.push(perpMarket.symbol)
    }
    return index
  }

  getIndexToAssetKey() {
    const index = []
    for (const collateral of this.state.data.collaterals) {
      index.push(collateral.oracleSymbol)
    }
    return index
  }

  private async loadDexMarket(connection: Connection, marketPubKey: PublicKey) {
    if (this.dexMarkets[marketPubKey.toString()])
      return this.dexMarkets[marketPubKey.toString()]
    this.dexMarkets[marketPubKey.toString()] = await ZoMarket.load(
      connection,
      marketPubKey,
      { commitment: "recent" },
      ZO_DEX_PROGRAM_ID,
    )
    return this.dexMarkets[marketPubKey.toString()]
  }
}

export const BASE_IMF_DIVIDER = 1000
export const MMF_MULTIPLIER = 2
export const USD_DECIMALS = 6
