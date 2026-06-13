/** Cantante predefinito per brani di gruppo (tutti al tavolo). */
export const GROUP_SINGER_NICKNAME = "Tutti Insieme";

const ADMIN_SINGER_NICK_PREFIX = "karaoke_admin_singer_nick:";

export function getAdminSingerNickname(adminUsername: string | undefined): string {
  if (!adminUsername) return "";
  try {
    return localStorage.getItem(`${ADMIN_SINGER_NICK_PREFIX}${adminUsername}`)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function setAdminSingerNickname(adminUsername: string, nickname: string): void {
  const key = `${ADMIN_SINGER_NICK_PREFIX}${adminUsername}`;
  const trimmed = nickname.trim();
  if (trimmed) localStorage.setItem(key, trimmed);
  else localStorage.removeItem(key);
}
