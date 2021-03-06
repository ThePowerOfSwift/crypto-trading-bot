'use strict';

module.exports = class PairsHttp {
    constructor(instances, exchangeManager, pairStateManager, eventEmitter) {
        this.instances = instances
        this.exchangeManager = exchangeManager
        this.pairStateManager = pairStateManager
        this.eventEmitter = eventEmitter
    }

    async getTradePairs() {
        return new Promise(async (resolve) => {
            let pairs = []

            for (const symbol of this.instances.symbols) {
                let position = await this.exchangeManager.getPosition(symbol.exchange, symbol.symbol)
                let state = await this.pairStateManager.get(symbol.exchange, symbol.symbol)

                let item = {
                    'exchange': symbol.exchange,
                    'symbol': symbol.symbol,
                    'watchdogs': symbol.watchdogs,
                    'state': symbol.state,
                    'has_position': position !== undefined,
                }

                if (state && state.state) {
                    item['process'] = state.state
                }

                pairs.push(item)
            }

            resolve(pairs)
        })
    }

    async triggerOrder(exchangeName, symbol, action) {
        return new Promise(async resolve => {

            let side = action
            let options = {}
            if (['long_market', 'short_market', 'close_market'].includes(action)) {
                options['market'] = true
                side = side.replace('_market', '')
            }

            this.pairStateManager.update(exchangeName, symbol, side, options)
            this.eventEmitter.emit('order_pair_state')

            resolve()
        })
    }
}
