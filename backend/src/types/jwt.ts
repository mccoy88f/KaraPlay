export type JwtRole = "guest" | "user" | "admin" | "superadmin";

export type JwtPayload = {
  sub: string;
  nickname: string;
  /** Per i token del pubblico: serata di appartenenza. Vuoto per i token admin. */
  eventId: string;
  role: JwtRole;
};
