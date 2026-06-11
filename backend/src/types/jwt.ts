export type JwtRole = "guest" | "user" | "admin";

export type JwtPayload = {
  sub: string;
  nickname: string;
  eventId: string;
  role: JwtRole;
};
