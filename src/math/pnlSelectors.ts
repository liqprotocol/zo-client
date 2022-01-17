import { createSelector } from "reselect"
import positionsSelectors from "../positions/positionsSelectors"
import marketsSelectors from "../markets/marketsSelectors"
import { ZERO } from "../../../config/config"
import Decimal from "decimal.js"
import { UserStatus } from "../user/state/userState"
import userSelectors from "../user/userSelectors"
import { PositionIState } from "../positions/positionsState"

function getPnL(markets, position: PositionIState): Decimal {
  const market = markets[position.marketKey]
  const diff = position.coins.decimal.mul(market.markPrice.decimal).sub(position.pCoins.decimal)

  if (position.isLong)
    return diff
  return diff.mul(-1)
}


/**
 * pnl for a specific position
 */
const _positionPnL = (position: PositionIState) => createSelector(userSelectors.userStatus, marketsSelectors.markets, (userStatus, markets) => {
  if (userStatus !== UserStatus.Initialized) {
    return ZERO.decimal()
  }
  return getPnL(markets, position)
})

/**
 * total pnl
 */
const _cumulativePnL = createSelector(userSelectors.userStatus, positionsSelectors.positions, marketsSelectors.markets, (userStatus, positions, markets) => {
  if (userStatus !== UserStatus.Initialized) {
    return ZERO.decimal()
  }
  let totalPnL = ZERO.decimal()
  for (const position of positions) {
    console.log(position.coins.number)
    console.log(position.pCoins.number)
    totalPnL = totalPnL.add(getPnL(markets, position))
  }

  return totalPnL
})

/**
 *  realized pnl
 */
const _realizedPnl = createSelector(userSelectors.userStatus, positionsSelectors.positions, (userStatus, positions) => {
  if (userStatus !== UserStatus.Initialized) {
    return ZERO.decimal()
  }
  let realizedPnL = ZERO.decimal()
  for (const position of positions) {
    realizedPnL = realizedPnL.add(position.realizedPnL.number)
  }
  return realizedPnL
})

/**
 *  funding
 */
const _funding = createSelector(userSelectors.userStatus, positionsSelectors.positions, marketsSelectors.markets, (userStatus, positions, markets) => {
  if (userStatus !== UserStatus.Initialized) {
    return ZERO.decimal()
  }
  let funding = ZERO.decimal()
  for (const position of positions) {
    if (position.isLong) {
      const fundingDifference = markets[position.marketKey].fundingIndex.sub(position.fundingIndex)
      funding = funding.sub(position.coins.decimal.mul(fundingDifference))
    } else {
      const fundingDifference = markets[position.marketKey].fundingIndex.sub(position.fundingIndex)
      funding = funding.add(position.coins.decimal.mul(fundingDifference))
    }
  }
  return funding
})

/**
 * number selectors for fe
 */
const positionPnL = (position: PositionIState) => createSelector(_positionPnL(position), (_positionPnL) => {
  return _positionPnL.toNumber()
})

const pnlSelectors = {
  _realizedPnl,
  _funding,
  _cumulativePnL,
  _positionPnL,
  positionPnL,
}

export default pnlSelectors
