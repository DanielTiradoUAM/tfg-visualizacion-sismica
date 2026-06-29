import * as sp from "../../vendor/seisplot/seisplotjs.mjs";
import { applySignalFilter, DEFAULT_SIGNAL_FILTER } from "./filters.js";

export const DEFAULT_TRANSFER_BAND = {
  f1: 0.5,
  f2: 1.0,
  f3: 35.0,
  f4: 45.0,
};

export async function removeInstrumentResponseIfPossible(
  seis,
  channel,
  {
    signalFilter = DEFAULT_SIGNAL_FILTER,
    transferBand = DEFAULT_TRANSFER_BAND,
    removeResponse = true,
  } = {}
) {
  if (!seis) {
    return seis;
  }

  try {
    let processed = sp.filter.rMean(seis);
    processed = sp.filter.removeTrend(processed);
    processed = applySignalFilter(processed, signalFilter);
    processed = sp.taper.taper(processed);

    if (!removeResponse || !channel?.response) {
      if (removeResponse && !channel?.response) {
        console.warn("No hay response metadata, no se puede remover respuesta instrumental");
      }
      return processed;
    }

    return sp.transfer.transfer(
      processed,
      channel.response,
      transferBand.f1,
      transferBand.f2,
      transferBand.f3,
      transferBand.f4
    );
  } catch (err) {
    console.error("Error removiendo respuesta instrumental:", err);
    return seis;
  }
}
