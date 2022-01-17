import { MarketsMathManager } from "./MarketsMathManager";
import { Connection, PublicKey } from "@solana/web3.js";
import Margin from "../../accounts/Margin";

export abstract class BaseUser {
  /**
   * internal info
   */
  margin: Margin;
  MarketsMathManager: MarketsMathManager;

  constructor(margin: Margin, MarketsMathManager: MarketsMathManager) {
    this.margin = margin;
    this.MarketsMathManager = MarketsMathManager;
  }

  async loadBalances(indexToAssetKey: { [key: number]: string }) {
    const balances = {};
    let index = 0;
    for (const collateral of this.margin.data.actualCollateral) {
      balances[indexToAssetKey[index]] = collateral;
      index++;
    }

    return balances;
  }

  /**
   * loading positions, note that markets have to be loaded in the correct order
   * @param markets
   * @param indexToMarketKey
   */
  async loadPositions(
    markets: { [key: string]: GeneralMarketInfoIState },
    indexToMarketKey: { [key: number]: string },
  ): Promise<PositionIState[]> {
    const positions: PositionIState[] = [];
    const recordedMarkets = {};
    let index = 0;
    for (const oo of this.margin.control.data.openOrdersAgg) {
      if (oo.key.toString() != PublicKey.default.toString()) {
        const market = markets[indexToMarketKey[index]];
        const coins = new Num(oo.posSize, market.assetDecimals);
        const pCoins = new Num(oo.nativePcTotal, USD_DECIMALS);
        const realizedPnl = new Num(oo.realizedPnl, market.assetDecimals);
        const fundingIndex = new Num(oo.fundingIndex, USD_DECIMALS).decimal;

        positions.push({
          coins: new Num(Math.abs(coins.number), coins.decimals),
          pCoins: new Num(Math.abs(pCoins.number), pCoins.decimals),
          realizedPnL: realizedPnl,
          fundingIndex: fundingIndex,
          marketKey: market.symbol,
          isLong: coins.number > 0,
        });

        recordedMarkets[market.symbol] = true;
      }
      index++;
    }

    for (const market of Object.values(markets)) {
      if (recordedMarkets[market.symbol] == null) {
        positions.push({
          coins: new Num(0, market.assetDecimals),
          pCoins: new Num(0, USD_DECIMALS),
          realizedPnL: ZERO.tab(),
          fundingIndex: ONE.decimal(),
          marketKey: market.symbol,
          isLong: true,
        });
      }
    }

    return positions;
  }

  /**
   * load all active orders across all markets
   * @param markets
   * @param connection
   */
  async loadActiveOrders(
    markets: { [key: string]: GeneralMarketInfoIState },
    connection: Connection,
  ) {
    const orders: ActiveOrder[] = [];
    for (const market of Object.values(markets)) {
      orders.push(
        ...(await this.MarketsMathManager.getActiveOrders(
          market,
          this.margin.control.pubkey,
          connection,
        )),
      );
    }
    return orders;
  }

  static async load(marketsManager: MarketsManager, program: Program<Zo>) {
    try {
      const margin = await Margin.load(
        program,
        marketsManager.state,
        marketsManager.state.cache,
      );
      console.log(margin.pubkey.toString());
      return new User(margin, marketsManager);
    } catch (_) {
      return null;
    }
  }
}
