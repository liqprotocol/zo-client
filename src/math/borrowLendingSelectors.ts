import { createSelector } from "reselect"
import positionsSelectors from "../positions/positionsSelectors"
import marketsSelectors from "../markets/marketsSelectors"
import { ONE, VALUE_NERF, ZERO } from "../../../config/config"
import Decimal from "decimal.js"
import { UserStatus } from "../user/state/userState"
import userSelectors from "../user/userSelectors"
import pnlSelectors from "./pnlSelectors"
import marginSelectors from "./marginSelectors"
import collateralSelectors from "./collateralSelectors"
import balancesSelectors from "./balancesSelectors"

/**
 * unused collateral
 */
const freeCollateral = createSelector(
  userSelectors.userStatus,
  positionsSelectors._posInfos,
  marketsSelectors.markets,
  marginSelectors._accountValue,
  collateralSelectors._weightedCollateral,
  pnlSelectors._funding,
  collateralSelectors._borrowLendingTiedCollateral,
  (userStatus, _posInfos, markets, accountValue, _weightedCollateral, _funding, borrowLendingTiedCollateral) => {
    if (userStatus !== UserStatus.Initialized) {
      return ZERO.decimal()
    }


    const posInfo = _posInfos
    let tiedCollateral = ZERO.decimal()
    for (const marketKey of Object.keys(markets)) {
      const posNotional = posInfo[marketKey].posSize.mul(markets[marketKey].markPrice.decimal)
      let openSize = Decimal.max(posInfo[marketKey].long, posInfo[marketKey].short)
      tiedCollateral = tiedCollateral.add(markets[marketKey].baseImf.mul(openSize.add(posNotional)))
    }

    const freeCollateral = Decimal.min(accountValue, _funding.plus(_weightedCollateral)).minus(borrowLendingTiedCollateral).minus(tiedCollateral)
    return Decimal.max(ZERO.decimal(), freeCollateral)
  })

/**
 * withdrawable collateral w/o borrow
 */
const collateralWithdrawable = (assetKey: string) => createSelector(freeCollateral, balancesSelectors.assets, balancesSelectors.balance(assetKey), (freeCollateral, assets, balance) => {
  if (assets[assetKey]) {
    let res = Decimal.max(0, Decimal.min(balance, freeCollateral.div(assets[assetKey].indexPrice.decimal).div(assets[assetKey].weight / 1000)))

    if (res.toNumber() != balance) {
      res = res.mul(1 - VALUE_NERF)
    }
    return res
  }
  return ZERO.decimal()
})

/**
 * withdrawable collateral with borrow
 */
const collateralWithdrawableWithBorrow = (assetKey: string) => createSelector(freeCollateral, balancesSelectors.assets, collateralWithdrawable(assetKey), (freeCollateral, assets, collateralWithdrawable) => {
  if (assets[assetKey]) {
    const availableFreeWithdrawalNotional = collateralWithdrawable.mul(assets[assetKey].indexPrice.decimal)
    const factor = (new Decimal(1.1)).div(assets[assetKey].weight / 1000).minus(ONE.decimal())


    const availableToBorrow = (freeCollateral.minus(availableFreeWithdrawalNotional)).div(ONE.decimal().plus(factor)).div(assets[assetKey].indexPrice.decimal)
    return availableToBorrow.add(collateralWithdrawable).mul(1 - VALUE_NERF)
  }
  return ZERO.decimal()
})


const borrowLendingSelectors = {
  collateralWithdrawable,
  collateralWithdrawableWithBorrow,
  freeCollateral,
}

export default borrowLendingSelectors
