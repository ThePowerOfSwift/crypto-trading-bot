'use strict';

let Order = require('./../../dict/order')

/**
 * Provide a layer to trigger order states into "buy", "sell", "close", "cancel"
 *
 * @TODO: listen for order changed to clear "managedOrders"
 *
 * @type {module.PairStateExecution}
 */
module.exports = class PairStateExecution {
    constructor(pairStateManager, exchangeManager, orderCalculator, orderExecutor, logger) {
        this.pairStateManager = pairStateManager
        this.exchangeManager = exchangeManager
        this.orderCalculator = orderCalculator
        this.orderExecutor = orderExecutor
        this.logger = logger

        this.managedOrders = []
    }

    async onCancelPair(pair) {
        await this.orderExecutor.cancelAll(pair.exchange, pair.symbol)
        this.pairStateManager.clear(pair.exchange, pair.symbol)
    }

    async onSellBuyPair(pair, side) {
        let position = await this.exchangeManager.getPosition(pair.exchange, pair.symbol)

        if (position) {
            this.pairStateManager.clear(pair.exchange, pair.symbol)
            this.logger.debug('block selling order; open position:' + JSON.stringify([pair.exchange, pair.symbol]))
            return
        }

        let orders = (await this.exchangeManager.getOrders(pair.exchange, pair.symbol))

        let hasManagedOrder = false
        for (let key in orders) {
            // dont self remove the managed order
            if (this.isManagedOrder(orders[key].id)) {
                hasManagedOrder = true
                continue
            }

            await this.orderExecutor.cancelOrder(pair.exchange, orders[key].id)
        }

        if (!hasManagedOrder) {
            let order = await this.executeOrder(
                pair.exchange,
                pair.symbol,
                side,
                pair.options,
            )

            this.managedOrders.push(order)
        }
    }

    async onClosePair(pair) {
        let position = await this.exchangeManager.getPosition(pair.exchange, pair.symbol)

        if (!position) {
            this.pairStateManager.clear(pair.exchange, pair.symbol)
            this.logger.debug('block selling order; open position:' + JSON.stringify([pair.exchange, pair.symbol]))
            return
        }

        let orders = (await this.exchangeManager.getOrders(pair.exchange, pair.symbol))

        let hasManagedOrder = false
        for (let key in orders) {
            // dont self remove the managed order
            if (this.isManagedOrder(orders[key].id)) {
                hasManagedOrder = true
                continue
            }

            await this.orderExecutor.cancelOrder(pair.exchange, orders[key].id)
        }

        if (!hasManagedOrder) {
            let amount = Math.abs(position.amount)

            let order = await this.executeCloseOrder(
                pair.exchange,
                pair.symbol,
                position.side === 'short' ? amount : amount * -1, // invert the current position
                pair.options,
            )

            this.managedOrders.push(order)
        }
    }

    onPairStateExecutionTick() {
        // ordering in priority
        this.pairStateManager.getCancelPairs().forEach(async pair => {
            await this.onCancelPair(pair)
        })

        this.pairStateManager.getClosingPairs().forEach(async pair => {
            await this.onClosePair(pair)
        })

        this.pairStateManager.getSellingPairs().forEach(async pair => {
            await this.onSellBuyPair(pair, 'short')
        })

        this.pairStateManager.getBuyingPairs().forEach(async pair => {
            await this.onSellBuyPair(pair, 'long')
        })
    }

    isManagedOrder(orderId) {
        return this.managedOrders.find(order => order.id === orderId) !== undefined
    }

    async executeOrder(exchangeName, symbol, side, options) {
        return new Promise(async resolve => {
            let orderSize = this.orderCalculator.calculateOrderSize(exchangeName, symbol)
            if (!orderSize) {
                console.error('Invalid order size: ' + JSON.stringify([exchangeName, symbol, side]))
                resolve()
                return
            }

            let myOrder = options['market'] === true
                ? Order.createMarketOrder(symbol, orderSize)
                : Order.createLimitPostOnlyOrderAutoAdjustedPriceOrder(symbol, orderSize)

            let order = await this.orderExecutor.executeOrder(exchangeName, myOrder)

            resolve(order)
        })
    }

    async executeCloseOrder(exchangeName, symbol, orderSize, options) {
        let myOrder = options['market'] === true
            ? Order.createMarketOrder(symbol, orderSize)
            : Order.createCloseOrderWithPriceAdjustment(symbol, orderSize)

        return this.orderExecutor.executeOrder(exchangeName, myOrder)
    }
}
