/** Formatação para exibição em pt-BR. */
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Fortaleza",
});
const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : "—");
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : "—");
export const formatMoney = (v: number | null | undefined) => (v === null || v === undefined ? "—" : moneyFmt.format(Number(v)));
export const formatHours = (minutes: number) => `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-10" → "out" ou "out/26". */
export const monthLabel = (period: string, withYear = false) =>
  `${MONTHS_SHORT[Number(period.slice(5, 7)) - 1]}${withYear ? `/${period.slice(2, 4)}` : ""}`;

export function formatPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  const text = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const EMPLOYEE_STATUS_LABELS = {
  onboarding: "Em admissão",
  active: "Ativo",
  on_leave: "Afastado",
  terminated: "Desligado",
} as const;

export const EMPLOYMENT_TYPE_LABELS = {
  clt: "CLT",
  pj: "PJ",
  estagio: "Estágio",
  temporario: "Temporário",
  aprendiz: "Aprendiz",
  intermitente: "Intermitente",
} as const;

export const LEAVE_TYPE_LABELS = {
  ferias: "Férias",
  licenca_medica: "Licença médica",
  licenca_maternidade: "Licença-maternidade",
  licenca_paternidade: "Licença-paternidade",
  falta_justificada: "Falta justificada",
  folga: "Folga",
  outro: "Outro",
} as const;

export const LEAVE_STATUS_LABELS = {
  pending: "Aguardando decisão",
  approved: "Aprovada",
  rejected: "Recusada",
  cancelled: "Cancelada",
} as const;

export const DP_STATUS_LABELS = {
  draft: "Rascunho",
  submitted: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Recusada",
  exported: "Enviada à folha",
  cancelled: "Cancelada",
} as const;

/** Categorias dos documentos do RH e do DP (não vinculados a um colaborador). */
export const ORG_DOCUMENT_CATEGORIES = {
  rh: {
    politica: "Política interna",
    regulamento: "Regulamento interno",
    cct: "Convenção/acordo coletivo",
    saude_seguranca: "Saúde e segurança (PGR, PCMSO)",
    treinamento: "Treinamento",
    comunicado: "Comunicado",
    modelo: "Modelo de documento",
    outro: "Outro",
  },
  dp: {
    guia: "Guia de recolhimento (INSS, FGTS, DARF)",
    folha: "Folha e holerites",
    esocial: "eSocial (recibos)",
    beneficio: "Fatura de benefício (VT, VA, plano)",
    rescisao: "Rescisão e homologação",
    contabilidade: "Contabilidade",
    ponto: "Ponto (espelhos)",
    outro: "Outro",
  },
} as const;
export type OrgDocumentArea = keyof typeof ORG_DOCUMENT_CATEGORIES;

export const DOCUMENT_CATEGORY_LABELS = {
  contrato: "Contrato",
  documento_pessoal: "Documento pessoal",
  aso: "ASO",
  certificado: "Certificado",
  advertencia: "Advertência",
  ferias: "Férias",
  rescisao: "Rescisão",
  outro: "Outro",
} as const;
