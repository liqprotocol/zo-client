import { createSelector } from "reselect";
import Decimal from "decimal.js";
import userSelectors from "../user/userSelectors";
import { ONE, ZERO } from "../../../config/config";
import { UserStatus } from "../user/state/userState";
import balancesSelectors from "./balancesSelectors";

/**
 * weighted _POSITIVE_ collateral - borrowed
 */
const _weightedCollateral = createSelector(
  balancesSelectors.balances,
  balancesSelectors.assets,
  (balances, assets) => {
    let depositedCollateral = new Decimal(0);
    for (const marketKey of Object.keys(balances)) {
      if (balances[marketKey].number >= 0) {
        depositedCollateral = depositedCollateral.add(
          balances[marketKey].decimal
            .mul(assets[marketKey].indexPrice.decimal)
            .mul(assets[marketKey].weight / 1000),
        );
      } else {
        depositedCollateral = depositedCollateral.add(
          balances[marketKey].decimal.mul(assets[marketKey].indexPrice.decimal),
        );
      }
    }

    return depositedCollateral;
  },
);

/**
 * mmf and mmf weights for borrowed positions
 */
const _collateralMaintenanceMarginInfo = createSelector(
  userSelectors.userStatus,
  balancesSelectors.balances,
  balancesSelectors.assets,
  (userStatus, balances, assets) => {
    let [mmfWeightedTotal, mmfWeight] = [ZERO.decimal(), ZERO.decimal()];

    if (userStatus === UserStatus.Initialized) {
      for (const marketKey of Object.keys(balances)) {
        if (balances[marketKey].number < 0) {
          const factor = new Decimal(1.03)
            .div(assets[marketKey].weight / 1000)
            .minus(ONE.decimal());
          const weight = balances[marketKey].decimal.mul(
            assets[marketKey].indexPrice.decimal,
          );
          mmfWeightedTotal = mmfWeightedTotal.add(weight.mul(factor));
          mmfWeight = mmfWeight.add(weight);
        }
      }
    }

    return [mmfWeightedTotal.abs(), mmfWeight.abs()];
  },
);

/**
 * imf and imf weights for borrowed positions
 */
const _collateralInitialMarginInfo = createSelector(
  userSelectors.userStatus,
  balancesSelectors.balances,
  balancesSelectors.assets,
  (userStatus, balances, assets) => {
    let [imfWeightedTotal, imfWeight] = [ZERO.decimal(), ZERO.decimal()];

    if (userStatus === UserStatus.Initialized) {
      for (const marketKey of Object.keys(balances)) {
        if (balances[marketKey].number < 0) {
          const factor = new Decimal(1.1)
            .div(assets[marketKey].weight / 1000)
            .minus(ONE.decimal());
          const weight = balances[marketKey].decimal.mul(
            assets[marketKey].indexPrice.decimal,
          );
          imfWeightedTotal = imfWeightedTotal.add(weight.mul(factor));
          imfWeight = imfWeight.add(weight);
        }
      }
    }

    return [imfWeightedTotal.abs(), imfWeight.abs()];
  },
);

/**
 * mmf and mmf weights for borrowed positions
 */
const _tiedCollateral = createSelector(
  userSelectors.userStatus,
  balancesSelectors.balances,
  balancesSelectors.assets,
  (userStatus, balances, assets) => {
    let tiedCollateral = ZERO.decimal();
    if (userStatus === UserStatus.Initialized) {
      for (const marketKey of Object.keys(balances)) {
        if (balances[marketKey].number < 0) {
          const borrowNotional = balances[marketKey].decimal.mul(
            assets[marketKey].indexPrice.decimal,
          );
          tiedCollateral = tiedCollateral.add(
            new Decimal(1.1)
              .div(assets[marketKey].weight / 1000)
              .minus(1)
              .mul(borrowNotional.abs()),
          );
        }
      }
    }
    return tiedCollateral;
  },
);

const bnlPositionNotional = createSelector(
  balancesSelectors.balances,
  balancesSelectors.assets,
  (balances, assets) => {
    let bnlPositionNotional = new Decimal(0);
    for (const marketKey of Object.keys(balances)) {
      if (balances[marketKey].number < 0) {
        bnlPositionNotional = bnlPositionNotional.add(
          balances[marketKey].decimal.mul(assets[marketKey].indexPrice.decimal),
        );
      }
    }
    return bnlPositionNotional.abs();
  },
);

const collateralSelectors = {
  _borrowLendingTiedCollateral: _tiedCollateral,
  _weightedCollateral,
  _borrowLendingMaintenanceMarginInfo: _collateralMaintenanceMarginInfo,
  _borrowLendingInitialMarginInfo: _collateralInitialMarginInfo,
  bnlPositionNotional,
};

export default collateralSelectors;
