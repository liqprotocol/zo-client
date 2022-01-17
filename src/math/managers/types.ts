import Num from "../../Num";
import Decimal from "decimal.js";

export interface PositionIState {
  coins: Num;
  pCoins: Num;
  realizedPnL: Num;
  fundingIndex: Decimal;
  marketKey: string;
  isLong: boolean;
}
