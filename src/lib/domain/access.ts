/** Controle de acesso: revisão periódica, situação do usuário e leitura do histórico. */

export const REVIEW_DAYS = 90;
/** Aviso a partir de quantos dias antes do vencimento da revisão. */
export const REVIEW_WARN_DAYS = 15;

export type ReviewStatus = "em_dia" | "vence" | "vencida";

/** Dias desde a última revisão (ou concessão) e a situação em relação ao prazo. */
export function reviewStatus(reviewedAt: string | null, createdAt: string, now: Date = new Date()): { days: number; status: ReviewStatus } {
  const base = new Date(reviewedAt ?? createdAt).getTime();
  const days = Math.max(0, Math.floor((now.getTime() - base) / 86_400_000));
  const status = days >= REVIEW_DAYS ? "vencida" : days >= REVIEW_DAYS - REVIEW_WARN_DAYS ? "vence" : "em_dia";
  return { days, status };
}

export type UserStatus = "ativo" | "bloqueado" | "convite_pendente" | "sem_papel";

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ativo: "Ativo",
  bloqueado: "Bloqueado",
  convite_pendente: "Convite pendente",
  sem_papel: "Sem papel ativo",
};

export function userStatus(u: {
  banned_until: string | null;
  last_sign_in_at: string | null;
  activeRoles: number;
  suspendedRoles: number;
}, now: Date = new Date()): UserStatus {
  if ((u.banned_until && new Date(u.banned_until) > now) || (u.suspendedRoles > 0 && u.activeRoles === 0)) return "bloqueado";
  if (u.activeRoles === 0) return "sem_papel";
  if (!u.last_sign_in_at) return "convite_pendente";
  return "ativo";
}

export const ACCESS_EVENTS = {
  login: "Entrou",
  login_falhou: "Senha incorreta",
  link_enviado: "Pediu link de acesso",
  logout: "Saiu",
  bloqueio: "Acesso bloqueado",
  desbloqueio: "Acesso desbloqueado",
  sessoes_encerradas: "Sessões encerradas",
  link_reenviado: "Link de acesso reenviado",
} as const;
export type AccessEvent = keyof typeof ACCESS_EVENTS;

export function isAccessEvent(v: string): v is AccessEvent {
  return v in ACCESS_EVENTS;
}

/** "Chrome · Windows" a partir do User-Agent (aproximado, só para leitura humana). */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "—";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\/|Opera/.test(ua) ? "Opera" :
    /SamsungBrowser/.test(ua) ? "Samsung Internet" :
    /Chrome\/|CriOS/.test(ua) ? "Chrome" :
    /Firefox\/|FxiOS/.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" : null;
  const os =
    /iPhone|iPad|iPod/.test(ua) ? "iOS" :
    /Android/.test(ua) ? "Android" :
    /Windows/.test(ua) ? "Windows" :
    /Mac OS X|Macintosh/.test(ua) ? "macOS" :
    /Linux/.test(ua) ? "Linux" : null;
  if (!browser && !os) return ua.slice(0, 40);
  return [browser, os].filter(Boolean).join(" · ");
}

/** Primeiro IP de X-Forwarded-For (o cliente), validado por formato. */
export function clientIp(forwardedFor: string | null, realIp?: string | null): string | null {
  const first = (forwardedFor ?? "").split(",")[0]?.trim() || realIp?.trim() || "";
  return /^[0-9a-fA-F:.]{3,64}$/.test(first) ? first : null;
}
