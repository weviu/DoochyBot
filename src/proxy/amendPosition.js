const { v1: uuidv1 } = require('uuid');
const logger = require('../utils/logger');

// ProtoOAAmendPositionSLTPReq has no matching Res type — the library resolves it with {}
// immediately. The real outcome arrives as ProtoOAOrderErrorEvent (on failure) or
// ProtoOAExecutionEvent (on success), both carrying the original clientMsgId.
// We listen for an error event matching our clientMsgId for up to 3 seconds;
// silence within that window means success.
async function amendPositionSLTP(connection, positionId, symbol, sl, tp) {
  if (sl == null && tp == null) {
    return { success: true, message: 'No SL/TP to set' };
  }

  const payload = {
    ctidTraderAccountId: parseInt(connection.accountId),
    positionId: parseInt(positionId)
  };

  if (sl != null) payload.stopLoss = sl;
  if (tp != null) payload.takeProfit = tp;

  const clientMsgId = uuidv1();

  logger.info('Sending ProtoOAAmendPositionSLTPReq', {
    positionId, symbol, sl, tp, clientMsgId,
    payload: JSON.stringify(payload)
  });

  // Register error listener BEFORE sending (errors can arrive before async returns)
  const errorPromise = new Promise((resolve) => {
    const timer = setTimeout(() => {
      connection.removeListener('ProtoOAOrderErrorEvent', onError);
      resolve(null); // no error event within window = success
    }, 3000);

    const onError = (event) => {
      const msgMatches = event.clientMsgId === clientMsgId;
      const accountMatches = String(event.ctidTraderAccountId) === String(connection.accountId);
      if (msgMatches && accountMatches) {
        clearTimeout(timer);
        connection.removeListener('ProtoOAOrderErrorEvent', onError);
        resolve(event);
      }
    };

    connection.on('ProtoOAOrderErrorEvent', onError);
  });

  try {
    await connection.connection.sendCommand('ProtoOAAmendPositionSLTPReq', payload, clientMsgId);
  } catch (err) {
    const errorMsg = err.message || err.description || String(err) || 'Unknown amendment error';
    logger.error('ProtoOAAmendPositionSLTPReq send error', {
      positionId, symbol, sl, tp,
      error: errorMsg,
      rawError: JSON.stringify(err, null, 2)
    });
    return { success: false, error: errorMsg };
  }

  const errorEvent = await errorPromise;

  if (errorEvent) {
    const errorMsg = errorEvent.description || errorEvent.errorCode || 'Amendment rejected by cTrader';
    logger.error('ProtoOAAmendPositionSLTPReq rejected', {
      positionId, symbol, sl, tp,
      errorCode: errorEvent.errorCode,
      description: errorEvent.description
    });
    return { success: false, error: errorMsg };
  }

  logger.info('ProtoOAAmendPositionSLTPReq succeeded', { positionId, sl, tp });
  return { success: true };
}

module.exports = { amendPositionSLTP };
