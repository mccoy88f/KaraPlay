/** Posizione riproduzione inviata dallo schermo sala principale (solo presenter). */
export type DisplayTransportPayload = {
  performanceId: string;
  sec: number;
  playing: boolean;
  paused: boolean;
};

export type DisplayTransportState = Omit<DisplayTransportPayload, "performanceId">;

export type DisplayTransportTickFn = (state: DisplayTransportState, immediate?: boolean) => void;

/** Ritardo tipico rete/socket sul Gobbo: anticipa testi e video di ~350 ms. */
export const GOBBO_SYNC_LEAD_MS = 350;

export function gobboTransportSec(sec: number): number {
  return Math.max(0, sec - GOBBO_SYNC_LEAD_MS / 1000);
}

export function gobboTransportState(state: DisplayTransportState): DisplayTransportState {
  return { ...state, sec: gobboTransportSec(state.sec) };
}
