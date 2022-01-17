import { createSelector } from "reselect"
import positionsSelectors from "../positions/positionsSelectors"
import marketsSelectors from "../markets/marketsSelectors"
import activeOrdersSelectors from "../activeOrders/activeOrdersSelectors"
import { ONE, ZERO } from "../../../config/config"
import { UserStatus } from "../user/state/userState"
import userSelectors from "../user/userSelectors"
import pnlSelectors from "./pnlSelectors"
import collateralSelectors from "./collateralSelectors"
import { PositionIState } from "../positions/positionsState"
import balancesSelectors from "./balancesSelectors"
import tradeSelectors from "../trade/tradeSelectors"
import { ISwapInfo } from "../balances/state/balancesState"
import Decimal from "decimal.js"

/**
 * account value = collateral + all pnl
 */
const _accountValue = createSelector(userSelectors.userStatus, collateralSelectors._weightedCollateral, pnlSelectors._cumulativePnL, pnlSelectors._funding, (userStatus, _weightedCollateral, cumulativePnL, _funding) => {
  if (userStatus !== UserStatus.Initialized) {
    return ZERO.decimal()
  }
  return _weightedCollateral.add(cumulativePnL).add(_funding)
})


/**
 * true account value = collateral + all pnl
 */
const trueAccountValue = createSelector(userSelectors.userStatus, balancesSelectors._depositedCollateral, pnlSelectors._cumulativePnL, pnlSelectors._funding, (userStatus, _depositedCollateral, cumulativePnL, _funding) => {
  if (userStatus !== UserStatus.Initialized) {
    return 0
  }

  console.log(_depositedCollateral.toNumber(), cumulativePnL.toNumber(), _funding.toNumber())
  return _depositedCollateral.add(cumulativePnL).add(_funding).toNumber()
})

/**
 * value of position in usd
 */
const _totalPositionNotional = createSelector(userSelectors.userStatus, positionsSelectors.positions, marketsSelectors.markets, collateralSelectors.bnlPositionNotional, (userStatus, positions, markets, bnlPositionNotional) => {
  if (userStatus !== UserStatus.Initialized) {
    return ZERO.decimal()
  }
  let res = ZERO.decimal()
  for (const position of positions) {
    const market = markets[position.marketKey]
    const size = position.coins.decimal.mul(market.markPrice.decimal)
    res = res.add(size)
  }
  return res.add(bnlPositionNotional)
})

/**
 * value of open positions + orders in usd
 */
const _totalOpenPositionNotional = createSelector(userSelectors.userStatus, _totalPositionNotional, marketsSelectors.markets, activeOrdersSelectors.orders, (userStatus, totalPositionNotional, markets, orders) => {
  if (userStatus !== UserStatus.Initialized) {
    return ZERO.decimal()
  }
  let res = ZERO.decimal()
  for (const order of orders) {
    const market = markets[order.marketKey]

    const size = order.coins.decimal.mul(market.markPrice.decimal)
    res = res.add(size)
  }
  return res.add(totalPositionNotional)
})


/**
 * required mmf to maintain position
 */
const _maintenanceMarginFraction = createSelector(userSelectors.userStatus, marketsSelectors.markets, positionsSelectors._posInfos, collateralSelectors._borrowLendingMaintenanceMarginInfo, (userStatus, markets, _posInfos, _borrowLendingMaintenanceMarginInfo) => {
  if (userStatus !== UserStatus.Initialized) {
    return ZERO.decimal()
  }
  let [mmfWeightedTotal, mmfWeight] = _borrowLendingMaintenanceMarginInfo


  for (const marketKey of Object.keys(markets)) {
    const posNotional = _posInfos[marketKey].posSize.mul(markets[marketKey].markPrice.decimal)
    mmfWeight = mmfWeight.add(posNotional)
    const pmmf = markets[marketKey].pmmf


    mmfWeightedTotal = mmfWeightedTotal.add(pmmf.mul(posNotional))
  }

  if (mmfWeight.toNumber() === 0) {
    return ZERO.decimal()
  }
  return mmfWeightedTotal.div(mmfWeight)
})

/**
 * required imf to open position
 */
const _initialMarginFraction = createSelector(userSelectors.userStatus, marketsSelectors.markets, positionsSelectors._posInfos, collateralSelectors._borrowLendingInitialMarginInfo, (userStatus, markets, _posInfos, _borrowLendingInitialMarginInfo) => {
  if (userStatus !== UserStatus.Initialized) {
    return ZERO.decimal()
  }
  let [imfWeightedTotal, imfWeight] = _borrowLendingInitialMarginInfo


  for (const marketKey of Object.keys(markets)) {
    const posNotional = _posInfos[marketKey].posSize.mul(markets[marketKey].markPrice.decimal)
    imfWeight = imfWeight.add(posNotional)
    const pimf = markets[marketKey].pmmf.mul(2)
    imfWeightedTotal = imfWeightedTotal.add(pimf.mul(posNotional))
  }

  if (imfWeight.toNumber() === 0) {
    return ZERO.decimal()
  }
  return imfWeightedTotal.div(imfWeight)
})

/**
 * required imf to open position
 */
const _openMarginFraction = createSelector(userSelectors.userStatus, _totalOpenPositionNotional, _accountValue, collateralSelectors._weightedCollateral, (userStatus, _totalOpenPositionNotional, _accountValue, _weightedCollateral) => {
  if (userStatus !== UserStatus.Initialized) {
    return ZERO.decimal()
  }
  if (_totalOpenPositionNotional.toNumber() == 0) {
    return ONE.decimal()
  }
  return Decimal.min(_accountValue, _weightedCollateral).div(_totalOpenPositionNotional)
})


/**
 * current margin fraction
 */
const _marginFraction = createSelector(userSelectors.userStatus, _accountValue, _totalPositionNotional, (userStatus, accountValue, _totalPositionNotional) => {
  if (userStatus !== UserStatus.Initialized) {
    return ZERO.decimal()
  }
  if (_totalPositionNotional.toNumber() === 0) {
    return ONE.decimal()
  }

  return ((accountValue)).div(_totalPositionNotional)
})


/**
 * liquidation price for a specific asset
 */
const liqPrice = (position: PositionIState, marketKey: string = position.marketKey) => createSelector(userSelectors.userStatus, _maintenanceMarginFraction, _totalOpenPositionNotional, marketsSelectors.markets, _marginFraction, (userStatus, maintenanceMarginFraction, totalOpenPositionNotional, markets, marginFraction) => {
  if (userStatus !== UserStatus.Initialized) {
    return 0
  }
  const pmmf = markets[marketKey].pmmf
  const markPrice = markets[marketKey].markPrice.decimal

  const priceChange = ((marginFraction.sub(maintenanceMarginFraction).mul(totalOpenPositionNotional))).div(position.coins.decimal.mul(ONE.decimal().sub(pmmf)))
  if (position.isLong) {
    const price = markPrice.sub(priceChange).toNumber()
    return price > 0 ? price : Infinity
  }
  const price = markPrice.add(priceChange).toNumber()
  return price > 0 ? price : Infinity
})


/**
 * number values for existing selectors iu
 */
const accountValue = createSelector(_accountValue, (_accountValue) => {
  return _accountValue.toNumber()
})

const totalOpenPositionNotional = createSelector(_totalOpenPositionNotional, (_totalOpenPositionNotional) => {
  return _totalOpenPositionNotional.toNumber()
})

const totalPositionNotional = createSelector(_totalPositionNotional, (_totalPositionNotional) => {
  return _totalPositionNotional.toNumber()
})

const marginFraction = createSelector(_marginFraction, (_marginFraction) => {
  return _marginFraction.toNumber()
})

const openMarginFraction = createSelector(_openMarginFraction, (_openMarginFraction) => {
  return _openMarginFraction.toNumber()
})

const maintenanceMarginFraction = createSelector(_maintenanceMarginFraction, (_maintenanceMarginFraction) => {
  return _maintenanceMarginFraction.toNumber()
})

const initialMarginFraction = createSelector(_initialMarginFraction, (_initialMarginFraction) => {
  return _initialMarginFraction.toNumber()
})

//see formula here: https://www.desmos.com/calculator/cr70vxtn13
function computeRisk(marginFraction: number, maintenanceMarginFraction) {
  // const x = Math.min(100, marginFraction == 0 ? 0 : 100 * maintenanceMarginFraction / marginFraction) / 100
  // const m = maintenanceMarginFraction
  // const c = 1 / marginFraction
  // const A = (Math.log(m * c / x - 1 + c) - Math.log(c)) * (1 - m * c)
  // const B = Math.log(m * c + c - 1) - Math.log(c)
  // const risk = (A / B + m * c) * 100
  //

  const risk = Math.abs(Math.log(Math.min(1, marginFraction)) / Math.log(maintenanceMarginFraction) * 100)

  const linearRisk = Math.min(100, marginFraction == 0 ? 0 : 100 * maintenanceMarginFraction / marginFraction) / 100
  if (isNaN(risk))
    return 0
  if (linearRisk > risk)
    return linearRisk
  return risk
}

const risk = createSelector(_maintenanceMarginFraction, marginFraction, (_maintenanceMarginFraction, _marginFraction) => {
  const maintenanceMarginFraction = _maintenanceMarginFraction.toNumber()
  const marginFraction = Math.max(0, _marginFraction)
  return computeRisk(marginFraction, maintenanceMarginFraction)
})
//0.4665691165959263 46.65691165959263 0.05292095375297779 8.816339909022767

const riskPerpImpact = createSelector(maintenanceMarginFraction, tradeSelectors.trade, marketsSelectors.marketInfo, positionsSelectors._posInfos, risk, totalPositionNotional, accountValue, (_maintenanceMarginFraction, trade, marketInfo, posInfos, risk, totalPositionNotional, accountValue) => {
  const posInfo = posInfos[marketInfo.symbol]
  if (trade.coins == 0) {
    return 0
  }
  if (posInfo) {
    let long = posInfo.long.toNumber()
    let short = posInfo.short.toNumber()
    const initOpenSize = Math.max(long, short)
    if (trade.long) {
      long += trade.coins
    } else {
      short += trade.coins
    }
    const newOpenSize = Math.max(long, short)
    const openSizeIncrease = newOpenSize - initOpenSize
    const posNotionalIncrease = openSizeIncrease * marketInfo.markPrice.number
    const mmfIncrease = openSizeIncrease * marketInfo.pmmf.toNumber() / 2
    const maintenanceMarginFraction = _maintenanceMarginFraction + mmfIncrease
    const marginFraction = accountValue / (totalPositionNotional + posNotionalIncrease)

    if (marginFraction == 0) {
      return -(isNaN(risk) ? 0 : risk)
    }
    const impact = computeRisk(marginFraction, maintenanceMarginFraction) - risk
    return isNaN(impact) ? 0 : impact
  }
  return 0
})

function computeParamsAdjustmentPostAssetWithdrawal(balance, amount, asset, maintenanceMarginFraction, accountValue, totalPositionNotional) {
  const amountWithdrawn = Math.min(Math.max(0, balance), amount)
  const amountBorrowed = amount - amountWithdrawn
  const posNotionalIncrease = amountBorrowed * asset.indexPrice.number
  const mmfIncrease = amountBorrowed * ((1.03 / asset.weight) - 1)
  maintenanceMarginFraction = maintenanceMarginFraction + mmfIncrease
  accountValue -= amount * asset.indexPrice.number
  totalPositionNotional = (totalPositionNotional + posNotionalIncrease)
  return { maintenanceMarginFraction, accountValue, totalPositionNotional }
}

const riskWithdrawAssetImpact = (assetSymbol, amount) => createSelector(maintenanceMarginFraction, balancesSelectors.asset(assetSymbol), balancesSelectors.balance(assetSymbol), risk, totalPositionNotional, accountValue, (_maintenanceMarginFraction, asset, balance, risk, _totalPositionNotional, _accountValue) => {
  if (amount == 0) {
    return 0
  }
  let totalPositionNotional = _totalPositionNotional
  let accountValue = _accountValue
  let maintenanceMarginFraction = _maintenanceMarginFraction
  if (asset) {
    const __ret = computeParamsAdjustmentPostAssetWithdrawal(balance, amount, asset, maintenanceMarginFraction, accountValue, totalPositionNotional)
    maintenanceMarginFraction = __ret.maintenanceMarginFraction
    accountValue = __ret.accountValue
    totalPositionNotional = __ret.totalPositionNotional
    const marginFraction = accountValue / totalPositionNotional
    const impact = computeRisk(marginFraction, maintenanceMarginFraction) - risk
    return isNaN(impact) ? 0 : impact
  }
  return 0
})

function computeParamsAdjustmentPostAssetDeposit(balance, amount, asset, maintenanceMarginFraction, accountValue, totalPositionNotional) {
  const amountRepaid = Math.min(Math.max(0, -balance), amount)
  const posNotionalDecrease = amountRepaid * asset.indexPrice.number
  const mmfDecrease = amountRepaid * ((1.03 / asset.weight) - 1)
  maintenanceMarginFraction = maintenanceMarginFraction - mmfDecrease
  accountValue += amount * asset.indexPrice.number
  totalPositionNotional = (totalPositionNotional - posNotionalDecrease)
  return { maintenanceMarginFraction, accountValue, totalPositionNotional }
}

const riskDepositAssetImpact = (assetSymbol, amount) => createSelector(maintenanceMarginFraction, balancesSelectors.asset(assetSymbol), balancesSelectors.balance(assetSymbol), risk, totalPositionNotional, accountValue, (_maintenanceMarginFraction, asset, balance, risk, _totalPositionNotional, _accountValue) => {
  if (amount == 0) {
    return 0
  }
  let totalPositionNotional = _totalPositionNotional
  let accountValue = _accountValue
  let maintenanceMarginFraction = _maintenanceMarginFraction
  if (asset) {
    const __ret = computeParamsAdjustmentPostAssetDeposit(balance, amount, asset, maintenanceMarginFraction, accountValue, totalPositionNotional)
    maintenanceMarginFraction = __ret.maintenanceMarginFraction
    accountValue = __ret.accountValue
    totalPositionNotional = __ret.totalPositionNotional
    const marginFraction = accountValue / totalPositionNotional
    const impact = computeRisk(marginFraction, maintenanceMarginFraction) - risk
    return isNaN(impact) ? 0 : impact
  }
  return 0
})

const riskSwapAssetsImpact = (swapInfo: ISwapInfo) => createSelector(maintenanceMarginFraction, balancesSelectors.asset(swapInfo.fromAssetKey), balancesSelectors.balance(swapInfo.fromAssetKey), balancesSelectors.asset(swapInfo.toAssetKey), balancesSelectors.balance(swapInfo.toAssetKey), risk, totalPositionNotional, accountValue, (_maintenanceMarginFraction, fromAsset, fromBalance, toAsset, toBalance, risk, _totalPositionNotional, _accountValue) => {
  if (swapInfo.fromAmount == 0 || swapInfo.toAmount == 0) {
    return 0
  }
  let totalPositionNotional = _totalPositionNotional
  let accountValue = _accountValue
  let maintenanceMarginFraction = _maintenanceMarginFraction
  if (fromAsset && toAsset) {
    let __ret = computeParamsAdjustmentPostAssetWithdrawal(fromBalance, swapInfo.fromAmount, fromAsset, maintenanceMarginFraction, accountValue, totalPositionNotional)
    maintenanceMarginFraction = __ret.maintenanceMarginFraction
    accountValue = __ret.accountValue
    totalPositionNotional = __ret.totalPositionNotional
    __ret = computeParamsAdjustmentPostAssetDeposit(toBalance, swapInfo.toAmount, toAsset, maintenanceMarginFraction, accountValue, totalPositionNotional)
    maintenanceMarginFraction = __ret.maintenanceMarginFraction
    accountValue = __ret.accountValue
    totalPositionNotional = __ret.totalPositionNotional
    const marginFraction = accountValue / totalPositionNotional
    const impact = computeRisk(marginFraction, maintenanceMarginFraction) - risk
    return isNaN(impact) ? 0 : impact
  }
  return 0
})

const accountLeverage = createSelector(totalOpenPositionNotional, accountValue, (_totalOpenPositionNotional, _accountValue) => {
  return _totalOpenPositionNotional === 0 ? 0 : _accountValue / _totalOpenPositionNotional
})

const marginSelectors = {
  _accountValue,
  trueAccountValue,
  _totalOpenPositionNotional,
  accountValue,
  totalOpenPositionNotional,
  totalPositionNotional,
  marginFraction,
  maintenanceMarginFraction,
  liqPrice,
  risk,
  riskPerpImpact,
  accountLeverage,
  openMarginFraction,
  riskWithdrawAssetImpact,
  riskDepositAssetImpact,
  riskSwapAssetsImpact,
  initialMarginFraction,
}

export default marginSelectors
