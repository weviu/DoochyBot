const logger = require('../../utils/logger');
const { SYMBOL_ID_TO_NAME, SYMBOL_LOT_SIZE } = require('../../utils/symbols');
const { getRawPrice, decodeSpotPrice } = require('../priceCache');

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

module.exports = (connection) => {
  return async (req, res) => {
    try {
      if (!connection.isConnected || !connection.isAuthenticated) {
        return res.status(503).json({ success: false, error: 'Not connected to cTrader' });
      }

      const now = Date.now();
      const fromTimestamp = req.query.from ? Number(req.query.from) : now - 7 * 24 * 60 * 60 * 1000;
      const toTimestamp = req.query.to ? Number(req.query.to) : now;

      const response = await connection.connection.sendCommand('ProtoOADealListReq', {
        ctidTraderAccountId: parseInt(connection.accountId),
        fromTimestamp,
        toTimestamp
      });

      const deals = response.deal || [];

      // Group by positionId → { openDeals, closeDeals }
      const positionMap = new Map();
      for (const deal of deals) {
        const status = deal.dealStatus;
        if (status !== 'FILLED' && status !== 2) continue;

        const posId = String(deal.positionId);
        if (!positionMap.has(posId)) {
          positionMap.set(posId, { openDeals: [], closeDeals: [] });
        }
        const entry = positionMap.get(posId);
        if (deal.closePositionDetail) {
          entry.closeDeals.push(deal);
        } else {
          entry.openDeals.push(deal);
        }
      }

      const positions = [];

      for (const [posId, { openDeals, closeDeals }] of positionMap) {
        const openDeal = openDeals[0];
        if (!openDeal) continue;

        const symbolId = String(openDeal.symbolId);
        const symbolName = SYMBOL_ID_TO_NAME[symbolId] || `sym:${symbolId}`;
        const lotSize = SYMBOL_LOT_SIZE[symbolName];
        const moneyScale = Math.pow(10, openDeal.moneyDigits ?? 2);

        const volumeUnits = Number(openDeal.filledVolume || openDeal.volume || 0);
        const volumeLots = lotSize ? volumeUnits / lotSize : volumeUnits;
        const isBuy = openDeal.tradeSide === 'BUY' || openDeal.tradeSide === 1;
        const openTs = openDeal.executionTimestamp ? Number(openDeal.executionTimestamp) : null;
        const entryPrice = openDeal.executionPrice ?? null;

        const pos = {
          positionId: posId,
          symbol: symbolName,
          direction: isBuy ? 'BUY' : 'SELL',
          volume: parseFloat(volumeLots.toFixed(4)),
          entryPrice,
          openTime: openTs ? new Date(openTs).toISOString().replace('T', ' ').split('.')[0] : null,
        };

        if (closeDeals.length > 0) {
          let totalGrossProfit = 0;
          let totalSwap = 0;
          let totalCommission = 0;
          let lastCloseTs = 0;
          let lastClosePrice = null;

          for (const cd of closeDeals) {
            const cpd = cd.closePositionDetail;
            // Use closePositionDetail.moneyDigits if present, fall back to deal moneyDigits
            const cpdScale = Math.pow(10, cpd.moneyDigits ?? cd.moneyDigits ?? 2);
            totalGrossProfit += Number(cpd.grossProfit || 0) / cpdScale;
            totalSwap += Number(cpd.swap || 0) / cpdScale;
            // closePositionDetail.commission already includes both open and close commission
            totalCommission += Number(cpd.commission || 0) / cpdScale;

            const cdTs = cd.executionTimestamp ? Number(cd.executionTimestamp) : 0;
            if (cdTs > lastCloseTs) {
              lastCloseTs = cdTs;
              lastClosePrice = cd.executionPrice ?? null;
            }
          }

          const durationMs = openTs && lastCloseTs ? lastCloseTs - openTs : null;

          pos.status = 'closed';
          pos.closePrice = lastClosePrice;
          pos.closeTime = lastCloseTs ? new Date(lastCloseTs).toISOString().replace('T', ' ').split('.')[0] : null;
          pos.duration = durationMs != null ? formatDuration(durationMs) : null;
          pos.grossPnL = parseFloat(totalGrossProfit.toFixed(2));
          pos.swap = parseFloat(totalSwap.toFixed(2));
          pos.commission = parseFloat(totalCommission.toFixed(2));
          // realizedPnL = Net USD (matches cTrader UI "Net USD" column)
          pos.realizedPnL = parseFloat((totalGrossProfit + totalSwap + totalCommission).toFixed(2));
        } else {
          pos.status = 'open';
          // Compute live unrealized P&L from price cache
          const priceData = getRawPrice(symbolId);
          if (priceData && entryPrice) {
            const rawClose = isBuy ? priceData.bid : priceData.ask;
            const closePrice = decodeSpotPrice(rawClose, entryPrice);
            if (closePrice != null) {
              const contractSize = volumeUnits * 0.01;
              const dir = isBuy ? 1 : -1;
              pos.unrealizedPnL = parseFloat((dir * (closePrice - entryPrice) * contractSize).toFixed(2));
            }
          }
        }

        positions.push(pos);
      }

      positions.sort((a, b) => (a.openTime || '').localeCompare(b.openTime || ''));

      res.json({ success: true, data: positions, hasMore: response.hasMore || false });
    } catch (err) {
      logger.error('History fetch error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  };
};
