import { describe, expect, it } from "vitest";
import { clientIp, describeUserAgent, reviewStatus, userStatus } from "./access";

const now = new Date("2026-10-24T12:00:00Z");

describe("revisão de acessos", () => {
  it("conta a partir da revisão ou, sem ela, da concessão", () => {
    expect(reviewStatus("2026-10-01T12:00:00Z", "2025-01-01T00:00:00Z", now)).toEqual({ days: 23, status: "em_dia" });
    expect(reviewStatus(null, "2026-08-10T12:00:00Z", now)).toEqual({ days: 75, status: "vence" });
    expect(reviewStatus(null, "2026-07-01T12:00:00Z", now).status).toBe("vencida");
  });
});

describe("situação do usuário", () => {
  const base = { banned_until: null, last_sign_in_at: "2026-10-20T10:00:00Z", activeRoles: 1, suspendedRoles: 0 };
  it("classifica", () => {
    expect(userStatus(base, now)).toBe("ativo");
    expect(userStatus({ ...base, last_sign_in_at: null }, now)).toBe("convite_pendente");
    expect(userStatus({ ...base, activeRoles: 0, suspendedRoles: 2 }, now)).toBe("bloqueado");
    expect(userStatus({ ...base, banned_until: "2126-01-01T00:00:00Z" }, now)).toBe("bloqueado");
    expect(userStatus({ ...base, banned_until: "2020-01-01T00:00:00Z" }, now)).toBe("ativo");
    expect(userStatus({ ...base, activeRoles: 0 }, now)).toBe("sem_papel");
  });
});

describe("leitura do histórico", () => {
  it("descreve o navegador", () => {
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36")).toBe("Chrome · Windows");
    expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari · iOS");
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0")).toBe("Edge · Windows");
    expect(describeUserAgent(null)).toBe("—");
  });
  it("extrai o IP do cliente", () => {
    expect(clientIp("177.10.20.30, 76.76.21.1")).toBe("177.10.20.30");
    expect(clientIp(null, "2804:14c::1")).toBe("2804:14c::1");
    expect(clientIp("<script>")).toBeNull();
  });
});
