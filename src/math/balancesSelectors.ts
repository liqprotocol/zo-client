import { ReducersNames } from "../../utils/reducersNames";
import { AnyProps, keySelectors } from "../../utils/helpers";
import { createSelector } from "reselect";
import Decimal from "decimal.js";
import {
  balancesIState,
  DUMMY_ASSET_INFO,
} from "../balances/state/balancesState";
import { USDC_MARKET_KEY, USDC_SYMBOL } from "../../../config/config";
import pnlSelectors from "./pnlSelectors";
import { Num } from "@zero_one/client";
import userSelectors from "../user/userSelectors";
import { UserStatus } from "../user/state/userState";
import { TokenMetas } from "../../../components/constants/TokenMetas";

const balancesStore = (s: AnyProps) =>
  s[ReducersNames.balance] as balancesIState;
const { balances, balancesStatus, assets, indexToAssetKey } = keySelectors(
  balancesStore,
  ["balances", "assets", "balancesStatus", "indexToAssetKey"],
);

const balance = (key: string) =>
  createSelector(
    balances,
    pnlSelectors._realizedPnl,
    (balances, realizedPnl) => {
      if (balances[key]) {
        if (key == USDC_SYMBOL) {
          return balances[key].number + realizedPnl.toNumber();
        }
        return balances[key].number;
      }
      return 0;
    },
  );

const asset = (key: string) =>
  createSelector(assets, (assets) => {
    if (assets[key]) return assets[key];
    return DUMMY_ASSET_INFO;
  });

const borrowsApy = (key: string) =>
  createSelector(assets, (assets) => {
    if (assets[key]) return assets[key].borrowsApy;
    return DUMMY_ASSET_INFO.borrowsApy;
  });

const supplyApy = (key: string) =>
  createSelector(assets, (assets) => {
    if (assets[key]) return assets[key].supplyApy;
    return DUMMY_ASSET_INFO.supplyApy;
  });

const _balances = createSelector(
  balances,
  pnlSelectors._realizedPnl,
  (balances, realizedPnl) => {
    const finalBalances: any = {};
    for (const key of Object.keys(balances)) {
      if (key === USDC_MARKET_KEY) {
        finalBalances[key] = new Num(
          balances[key].decimal.add(realizedPnl),
          balances[key].decimals,
        );
      } else {
        finalBalances[key] = balances[key];
      }
    }
    return finalBalances;
  },
);

const visualDeposits = createSelector(_balances, assets, (balances, assets) => {
  const deposits: any = [];
  for (const key of Object.keys(balances)) {
    if (balances[key].number > 0) {
      deposits.push({
        key: TokenMetas(key).name,
        value: assets[key].indexPrice.number * balances[key].number,
        color: TokenMetas(key).color,
        // "icon": TokenMetas(key).colorIcon,
      });
    }
  }
  return deposits;
});

const visualBorrows = createSelector(_balances, assets, (balances, assets) => {
  const borrows: any = [];
  for (const key of Object.keys(balances)) {
    if (balances[key].number < 0) {
      borrows.push({
        key: TokenMetas(key).name,
        value: -assets[key].indexPrice.number * balances[key].number,
        color: TokenMetas(key).color,
        // "icon": TokenMetas(key).colorIcon,
      });
    }
  }
  return borrows;
});

/**
 * collaterals added externally + borrowed
 */
const _depositedCollateral = createSelector(
  balances,
  assets,
  pnlSelectors._realizedPnl,
  userSelectors.userStatus,
  (balances, assets, realizedPnl, userStatus) => {
    if (userStatus != UserStatus.Initialized) {
      return new Decimal(0);
    } else {
      let depositedCollateral = new Decimal(0);
      for (const asset of Object.values(assets)) {
        depositedCollateral = depositedCollateral.add(
          balances[asset.symbol].decimal.mul(asset.indexPrice.decimal),
        );
      }
      return depositedCollateral.add(realizedPnl);
    }
  },
);

/**
 * total borrows
 */
const totalBorrows = createSelector(
  balances,
  assets,
  userSelectors.userStatus,
  (balances, assets, userStatus) => {
    if (userStatus != UserStatus.Initialized) {
      return 0;
    } else {
      let totalBorrows = new Decimal(0);
      for (const asset of Object.values(assets)) {
        if (balances[asset.symbol].number < 0) {
          totalBorrows = totalBorrows.sub(
            balances[asset.symbol].decimal.mul(asset.indexPrice.decimal),
          );
        }
      }
      return totalBorrows.toNumber();
    }
  },
);

/**
 * number selectors for fe
 */
const depositedCollateral = createSelector(
  _depositedCollateral,
  (_depositedCollateral) => {
    return _depositedCollateral.toNumber();
  },
);

/**
 * total borrows
 */
const netApy = createSelector(
  balances,
  assets,
  userSelectors.userStatus,
  (balances, assets, userStatus) => {
    if (userStatus != UserStatus.Initialized) {
      return 0;
    }
    let netApyNotional = new Decimal(0);
    let notional = new Decimal(0);
    for (const asset of Object.values(assets)) {
      notional = notional.add(
        balances[asset.symbol].decimal.mul(asset.indexPrice.decimal),
      );
      const apy =
        balances[asset.symbol].number > 0 ? asset.supplyApy : asset.borrowsApy;
      netApyNotional = netApyNotional.add(
        balances[asset.symbol].decimal.mul(asset.indexPrice.decimal).mul(apy),
      );
    }
    return netApyNotional.div(notional).toNumber();
  },
);

// @ts-ignore
const balancesSelectors = {
  balance,
  asset,
  totalBorrows,
  balances: _balances,
  depositedCollateral,
  _depositedCollateral,
  assets,
  netApy,
  indexToAssetKey,
  balancesStatus,
  borrowsApy,
  supplyApy,
  visualDeposits,
  visualBorrows,
  uiDigits,
  uiPriceDigits,
};

export default balancesSelectors;
