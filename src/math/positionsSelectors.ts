import { ReducersNames } from "../../utils/reducersNames";
import { AnyProps, keySelectors } from "../../utils/helpers";
import { PositionsIState, PositionsStatus } from "./positionsState";
import { createSelector } from "reselect";
import userSelectors from "../user/userSelectors";
import marketsSelectors from "../markets/marketsSelectors";
import activeOrdersSelectors from "../activeOrders/activeOrdersSelectors";
import { UserStatus } from "../user/state/userState";
import { ZERO } from "../../../config/config";

const positionsStore = (s: AnyProps) =>
  s[ReducersNames.positions] as PositionsIState;
const { positions } = keySelectors(positionsStore, ["positions"]);

const position = (key: string) =>
  createSelector(positions, (positions) => {
    positions.find((el) => el.marketKey === key);
  });

const _posInfos = createSelector(
  userSelectors.userStatus,
  positions,
  marketsSelectors.markets,
  activeOrdersSelectors.orders,
  (userStatus, positions, markets, orders) => {
    if (userStatus !== UserStatus.Initialized) {
      return {};
    }
    const posInfo = {};
    for (const marketKey of Object.keys(markets)) {
      posInfo[marketKey] = {
        long: ZERO.decimal(),
        short: ZERO.decimal(),
        posSize: ZERO.decimal(),
      };
    }
    for (const position of positions) {
      posInfo[position.marketKey].posSize = position.coins.decimal;
      if (position.isLong) {
        posInfo[position.marketKey].long = position.coins.decimal;
      } else {
        posInfo[position.marketKey].short = position.coins.decimal;
      }
    }

    for (const order of orders) {
      if (order.long) {
        posInfo[order.marketKey].long = posInfo[order.marketKey].long.add(
          order.coins.decimal,
        );
      } else {
        posInfo[order.marketKey].short = posInfo[order.marketKey].short.add(
          order.coins.decimal,
        );
      }
    }

    return posInfo;
  },
);

const openPositions = createSelector(positions, (positions) => {
  return positions.filter((position) => position.coins.number != 0);
});

const positionsSelectors = {
  openPositions,
  positions,
  position,
  _posInfos,
};

export default positionsSelectors;
