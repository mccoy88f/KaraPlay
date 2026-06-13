/** Posizione riproduzione inviata dallo schermo sala principale (solo presenter). */
export type DisplayTransportPayload = {
  performanceId: string;
  sec: number;
  playing: boolean;
  paused: boolean;
};

export type DisplayTransportState = Omit<DisplayTransportPayload, "performanceId">;

export type DisplayTransportTickFn = (state: DisplayTransportState, immediate?: boolean) => void;
