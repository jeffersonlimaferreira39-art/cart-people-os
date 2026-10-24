import "server-only";

/** Variáveis de ambiente do servidor, validadas na primeira leitura. */
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}. Veja .env.example.`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabasePublishableKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
  /** Chave secreta (service role). Somente para convites e tarefas de sistema. */
  get supabaseSecretKey() {
    return required(
      "SUPABASE_SECRET_KEY",
      process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  },
  get siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  },
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY;
  },
  get anthropicModel() {
    return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
  },
};
