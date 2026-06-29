import * as sp from "../../vendor/seisplot/seisplotjs.mjs";

export const DEFAULT_SIGNAL_FILTER = {
  enabled: true,
  poles: 2,
  type: sp.filter.BAND_PASS,
  lowHz: 1.5,
  highHz: 45,
};

export const DEFAULT_EVENT_SIGNAL_FILTER = {
  enabled: true,
  poles: 2,
  type: sp.filter.BAND_PASS,
  lowHz: 0.5,
  highHz: 10,
};

export function applySignalFilter(seis, filterConfig = DEFAULT_SIGNAL_FILTER) {
  if (!filterConfig || filterConfig.enabled === false) {
    return seis;
  }

  const nyquist = seis.sampleRate / 2;
  let lowHz = Math.max(0.001, Number(filterConfig.lowHz) || 0.001);
  const highHz = Math.min(Number(filterConfig.highHz) || nyquist * 0.9, nyquist * 0.9);

  if (lowHz >= highHz) {
    console.warn(`[Filters] Rango bandpass no valido: ${lowHz}-${highHz} Hz`);
    return seis;
  }

  const butterworth = sp.filter.createButterworth(
    filterConfig.poles ?? 2,
    sp.filter.BAND_PASS,
    lowHz,
    highHz,
    1 / seis.sampleRate
  );

  return sp.filter.applyFilter(butterworth, seis);
}
