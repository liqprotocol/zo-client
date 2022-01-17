import { createSelector } from "reselect";
import Decimal from "decimal.js";
import {
  MAKER_TRADE_FEE,
  TAKER_TRADE_FEE,
  VALUE_NERF,
  ZERO,
} from "../../../config/config";
import marketsSelectors from "../markets/marketsSelectors";
import marginSelectors from "./marginSelectors";
import tradeSelectors from "../trade/tradeSelectors";
import pnlSelectors from "./pnlSelectors";
import positionsSelectors from "../positions/positionsSelectors";
import collateralSelectors from "./collateralSelectors";
import userSelectors from "../user/userSelectors";
import { UserStatus } from "../user/state/userState";

/**
 *  maximum contracts is purchaseable by user
 */
const maxContractsPurchaseable = createSelector(
  tradeSelectors.trade,
  marginSelectors._accountValue,
  positionsSelectors._posInfos,
  marginSelectors._totalOpenPositionNotional,
  pnlSelectors._funding,
  collateralSelectors._weightedCollateral,
  marketsSelectors.marketInfo,
  userSelectors.userStatus,
  (
    trade,
    _accountValue,
    _posInfos,
    _totalOpenPositionNotional,
    _funding,
    _weightedCollateral,
    marketInfo,
    userStatus,
  ) => {
    if (userStatus === UserStatus.Initialized) {
      const markPrice = marketInfo.markPrice;
      const changeInOpenSizeAllowed = Decimal.min(
        _accountValue,
        _funding.plus(_weightedCollateral),
      )
        .div(marketInfo.baseImf)
        .minus(_totalOpenPositionNotional)
        .div(markPrice.decimal);
      const maxOpenSize = Decimal.max(
        _posInfos[marketInfo.symbol].long,
        _posInfos[marketInfo.symbol].short,
      ).add(changeInOpenSizeAllowed);
      const feeMultiplier = trade.postOrder
        ? 1 - MAKER_TRADE_FEE - VALUE_NERF
        : 1 - TAKER_TRADE_FEE - VALUE_NERF;
      if (trade.long) {
        return (
          feeMultiplier *
          Decimal.max(
            ZERO.decimal(),
            maxOpenSize.minus(_posInfos[marketInfo.symbol].long),
          ).toNumber()
        );
      }
      return (
        feeMultiplier *
        Decimal.max(
          ZERO.decimal(),
          maxOpenSize.minus(_posInfos[marketInfo.symbol].short),
        ).toNumber()
      );
    } else {
      return 0;
    }
  },
);

/**
 * maximum collateral spendable by user
 */
const maxCollateralSpendable = createSelector(
  tradeSelectors.trade,
  maxContractsPurchaseable,
  (trade, maxContractsPurchaseable) => {
    return trade.price * maxContractsPurchaseable;
  },
);

const tradeMarginSelectors = {
  maxCollateralSpendable,
  maxContractsPurchaseable,
};

export default tradeMarginSelectors;
