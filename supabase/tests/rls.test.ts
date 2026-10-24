/**
 * Testes de isolamento RLS e regras de fluxo, executados contra um Postgres real
 * com as migrações aplicadas (ver scripts/test-db.sh).
 *
 * Cenário: organização A com unidades U1 e U2; organização B com unidade B1.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!DATABASE_URL) throw new Error("Defina TEST_DATABASE_URL");

const db = new pg.Client({ connectionString: DATABASE_URL });

const id = () => randomUUID();
const ORG_A = id(), ORG_B = id();
const U1 = id(), U2 = id(), B1 = id();
const users = {
  adminA: id(), rhU1: id(), dpU1: id(), dp2U1: id(), diretoria: id(),
  gestor: id(), colab1: id(), colab2: id(), adminB: id(), unitAdminU1: id(),
};
const emp = { gestor: id(), colab1: id(), colab2: id(), b1: id() };

type Q = (sql: string, params?: unknown[]) => Promise<pg.QueryResult>;

/** Executa fn como usuário autenticado (ou anon) dentro de uma transação revertida. */
async function as<T>(userId: string | null, fn: (q: Q) => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    if (userId) {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
    } else {
      await db.query("set local role anon");
    }
    return await fn((sql, params) => db.query(sql, params));
  } finally {
    await db.query("rollback");
  }
}

/** Como as(), mas confirma a transação (para encadear passos de um fluxo). */
async function asCommit<T>(userId: string, fn: (q: Q) => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const r = await fn((sql, params) => db.query(sql, params));
    await db.query("commit");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

beforeAll(async () => {
  await db.connect();
  const q = (s: string, p?: unknown[]) => db.query(s, p);
  for (const [name, uid] of Object.entries(users)) {
    await q("insert into auth.users (id, email) values ($1, $2)", [uid, `${name}@teste.dev`]);
  }
  await q("insert into organizations (id, name) values ($1, 'Org A'), ($2, 'Org B')", [ORG_A, ORG_B]);
  await q(
    `insert into units (id, organization_id, name, code) values
     ($1, $4, 'Unidade 1', 'U1'), ($2, $4, 'Unidade 2', 'U2'), ($3, $5, 'Unidade B', 'B1')`,
    [U1, U2, B1, ORG_A, ORG_B],
  );
  const m = `insert into memberships (user_id, organization_id, unit_id, role) values ($1, $2, $3, $4)`;
  await q(m, [users.adminA, ORG_A, null, "admin"]);
  await q(m, [users.rhU1, ORG_A, U1, "rh"]);
  await q(m, [users.dpU1, ORG_A, U1, "dp"]);
  await q(m, [users.dp2U1, ORG_A, U1, "dp"]);
  await q(m, [users.diretoria, ORG_A, null, "diretoria"]);
  await q(m, [users.gestor, ORG_A, U1, "gestor"]);
  await q(m, [users.colab1, ORG_A, U1, "colaborador"]);
  await q(m, [users.colab2, ORG_A, U2, "colaborador"]);
  await q(m, [users.adminB, ORG_B, null, "admin"]);
  await q(m, [users.unitAdminU1, ORG_A, U1, "admin"]);

  const e = `insert into employees (id, organization_id, unit_id, user_id, manager_id, registration_number, full_name, hire_date)
             values ($1, $2, $3, $4, $5, $6, $7, '2024-01-10')`;
  await q(e, [emp.gestor, ORG_A, U1, users.gestor, null, "001", "Gestora Um"]);
  await q(e, [emp.colab1, ORG_A, U1, users.colab1, emp.gestor, "002", "Colaborador Um"]);
  await q(e, [emp.colab2, ORG_A, U2, users.colab2, null, "003", "Colaboradora Dois"]);
  await q(e, [emp.b1, ORG_B, B1, null, null, "001", "Pessoa da Org B"]);

  const s = `insert into employee_sensitive (employee_id, organization_id, unit_id, cpf, base_salary)
             values ($1, $2, $3, $4, $5)`;
  // organization_id/unit_id enviados errados de propósito: o trigger deve corrigir.
  await q(s, [emp.colab1, ORG_B, B1, "12345678901", 4200]);
  await q(s, [emp.colab2, ORG_A, U2, "10987654321", 3900]);
});

afterAll(async () => {
  await db.end();
});

const names = (r: pg.QueryResult) => r.rows.map((x) => x.full_name).sort();

describe("isolamento entre organizações e unidades", () => {
  it("anon não lê nenhuma tabela de pessoas", async () => {
    await expect(as(null, (q) => q("select * from employees"))).rejects.toThrow(/permission denied/);
  });

  it("admin da organização A vê as duas unidades e nada da organização B", async () => {
    const r = await as(users.adminA, (q) => q("select full_name from employees"));
    expect(names(r)).toEqual(["Colaborador Um", "Colaboradora Dois", "Gestora Um"]);
  });

  it("admin da organização B não vê ninguém da organização A", async () => {
    const r = await as(users.adminB, (q) => q("select full_name from employees"));
    expect(names(r)).toEqual(["Pessoa da Org B"]);
  });

  it("RH da unidade 1 vê apenas a unidade 1", async () => {
    const r = await as(users.rhU1, (q) => q("select full_name from employees"));
    expect(names(r)).toEqual(["Colaborador Um", "Gestora Um"]);
  });

  it("RH da unidade 1 não cadastra colaborador na unidade 2", async () => {
    await expect(
      as(users.rhU1, (q) =>
        q(
          `insert into employees (organization_id, unit_id, registration_number, full_name, hire_date)
           values ($1, $2, '999', 'Tentativa Indevida', '2025-01-01')`,
          [ORG_A, U2],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("RH da unidade 1 não grava dados sensíveis de colaborador da unidade 2", async () => {
    await expect(
      as(users.rhU1, (q) =>
        q("update employee_sensitive set base_salary = 1 where employee_id = $1 returning 1", [emp.colab2]),
      ),
    ).resolves.toHaveProperty("rowCount", 0);
  });

  it("o trigger de escopo corrige organização/unidade enviadas pelo cliente", async () => {
    const r = await db.query("select organization_id, unit_id from employee_sensitive where employee_id = $1", [
      emp.colab1,
    ]);
    expect(r.rows[0]).toEqual({ organization_id: ORG_A, unit_id: U1 });
  });
});

describe("papéis e dados sensíveis", () => {
  it("colaborador vê só o próprio cadastro", async () => {
    const r = await as(users.colab1, (q) => q("select full_name from employees"));
    expect(names(r)).toEqual(["Colaborador Um"]);
  });

  it("gestor vê a si e aos liderados", async () => {
    const r = await as(users.gestor, (q) => q("select full_name from employees"));
    expect(names(r)).toEqual(["Colaborador Um", "Gestora Um"]);
  });

  it("gestor não vê salário dos liderados", async () => {
    const r = await as(users.gestor, (q) => q("select * from employee_sensitive"));
    expect(r.rowCount).toBe(0);
  });

  it("diretoria vê o quadro, mas nenhum dado sensível", async () => {
    const all = await as(users.diretoria, (q) => q("select full_name from employees"));
    expect(all.rowCount).toBe(3);
    const s = await as(users.diretoria, (q) => q("select * from employee_sensitive"));
    expect(s.rowCount).toBe(0);
  });

  it("colaborador lê os próprios dados sensíveis, mas não os altera", async () => {
    const r = await as(users.colab1, (q) => q("select cpf from employee_sensitive"));
    expect(r.rows).toEqual([{ cpf: "12345678901" }]);
    const u = await as(users.colab1, (q) =>
      q("update employee_sensitive set base_salary = 99999 where employee_id = $1", [emp.colab1]),
    );
    expect(u.rowCount).toBe(0);
  });

  it("colaborador não concede papel a si mesmo", async () => {
    await expect(
      as(users.colab1, (q) =>
        q("insert into memberships (user_id, organization_id, role) values ($1, $2, 'admin')", [users.colab1, ORG_A]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("admin de unidade não cria outro admin", async () => {
    await expect(
      as(users.unitAdminU1, (q) =>
        q("insert into memberships (user_id, organization_id, unit_id, role) values ($1, $2, $3, 'admin')", [
          users.colab1, ORG_A, U1,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("impede ciclo de gestão", async () => {
    await expect(
      as(users.rhU1, (q) => q("update employees set manager_id = $1 where id = $2", [emp.colab1, emp.gestor])),
    ).rejects.toThrow(/Ciclo de gestão/);
  });
});

describe("fluxo de férias e ausências", () => {
  let leaveId = "";

  it("colaborador solicita férias e o status nasce pendente", async () => {
    const r = await asCommit(users.colab1, (q) =>
      q(
        `insert into leave_requests (employee_id, organization_id, unit_id, type, start_date, end_date, status)
         values ($1, $2, $3, 'ferias', '2026-12-07', '2026-12-21', 'approved') returning id, status, days`,
        [emp.colab1, ORG_A, U1],
      ),
    );
    leaveId = r.rows[0].id;
    expect(r.rows[0]).toMatchObject({ status: "pending", days: 15 });
  });

  it("colaborador não aprova a própria solicitação", async () => {
    await expect(
      as(users.colab1, (q) => q("update leave_requests set status = 'approved' where id = $1", [leaveId])),
    ).rejects.toThrow(/Somente o gestor|própria/);
  });

  it("colaborador de outra unidade nem enxerga a solicitação", async () => {
    const r = await as(users.colab2, (q) => q("select id from leave_requests"));
    expect(r.rowCount).toBe(0);
  });

  it("pedido sobreposto é recusado", async () => {
    await expect(
      as(users.colab1, (q) =>
        q(
          `insert into leave_requests (employee_id, organization_id, unit_id, type, start_date, end_date)
           values ($1, $2, $3, 'folga', '2026-12-10', '2026-12-10')`,
          [emp.colab1, ORG_A, U1],
        ),
      ),
    ).rejects.toThrow(/mesmo período/);
  });

  it("gestor aprova e o sistema registra quem decidiu", async () => {
    const r = await asCommit(users.gestor, (q) =>
      q("update leave_requests set status = 'approved' where id = $1 returning status, decided_by", [leaveId]),
    );
    expect(r.rows[0]).toEqual({ status: "approved", decided_by: users.gestor });
  });

  it("solicitação aprovada não tem as datas alteradas", async () => {
    await expect(
      as(users.rhU1, (q) => q("update leave_requests set end_date = '2026-12-31' where id = $1", [leaveId])),
    ).rejects.toThrow(/não pode ser alterada/);
  });

  it("colaborador não cancela férias já aprovadas", async () => {
    await expect(
      as(users.colab1, (q) => q("update leave_requests set status = 'cancelled' where id = $1", [leaveId])),
    ).rejects.toThrow(/não pode mais ser cancelada/);
  });
});

describe("movimentações do DP", () => {
  let eventId = "";

  it("gestor e colaborador não enxergam movimentações", async () => {
    await asCommit(users.dpU1, (q) =>
      q(
        `insert into dp_events (employee_id, organization_id, unit_id, type, effective_date, payload, status)
         values ($1, $2, $3, 'alteracao_salarial', '2026-11-01', '{"novo_salario": 4600}', 'submitted') returning id`,
        [emp.colab1, ORG_A, U1],
      ).then((r) => (eventId = r.rows[0].id)),
    );
    for (const u of [users.gestor, users.colab1]) {
      const r = await as(u, (q) => q("select id from dp_events"));
      expect(r.rowCount).toBe(0);
    }
  });

  it("quem cadastrou não aprova (segregação de funções)", async () => {
    await expect(
      as(users.dpU1, (q) => q("update dp_events set status = 'approved' where id = $1", [eventId])),
    ).rejects.toThrow(/segregação/);
  });

  it("outro analista de DP aprova", async () => {
    const r = await asCommit(users.dp2U1, (q) =>
      q("update dp_events set status = 'approved' where id = $1 returning approved_by", [eventId]),
    );
    expect(r.rows[0].approved_by).toBe(users.dp2U1);
  });

  it("movimentação aprovada não tem o conteúdo alterado", async () => {
    await expect(
      as(users.dp2U1, (q) => q(`update dp_events set payload = '{"novo_salario": 9999}' where id = $1`, [eventId])),
    ).rejects.toThrow(/Somente rascunhos/);
  });

  it("exportação exige lote", async () => {
    await expect(
      as(users.dp2U1, (q) => q("update dp_events set status = 'exported' where id = $1", [eventId])),
    ).rejects.toThrow(/lote/);
  });
});

describe("auditoria", () => {
  it("admin da organização lê a trilha; RH de unidade não", async () => {
    const a = await as(users.adminA, (q) => q("select count(*)::int as n from audit_log"));
    expect(a.rows[0].n).toBeGreaterThan(0);
    const r = await as(users.rhU1, (q) => q("select count(*)::int as n from audit_log"));
    expect(r.rows[0].n).toBe(0);
  });

  it("admin da organização B não vê a trilha da organização A", async () => {
    const r = await as(users.adminB, (q) =>
      q("select count(*)::int as n from audit_log where organization_id = $1", [ORG_A]),
    );
    expect(r.rows[0].n).toBe(0);
  });

  it("dados sensíveis são auditados sem valores", async () => {
    const r = await db.query(
      "select old_data, new_data from audit_log where table_name = 'employee_sensitive' and record_id = $1",
      [emp.colab1],
    );
    expect(r.rowCount).toBeGreaterThan(0);
    for (const row of r.rows) {
      expect(row.old_data).toBeNull();
      expect(row.new_data).toBeNull();
    }
  });

  it("ninguém apaga a trilha de auditoria", async () => {
    await expect(as(users.adminA, (q) => q("delete from audit_log"))).rejects.toThrow(/permission denied/);
  });
});

describe("registro de exportação de relatórios", () => {
  const log = (q: Q, user: string, org: string, unit: string | null) =>
    q("insert into report_exports (organization_id, unit_id, user_id, report, format, row_count) values ($1, $2, $3, 'quadro', 'xlsx', 3)", [
      org, unit, user,
    ]);

  it("usuário registra a própria exportação e o admin da organização lê", async () => {
    await asCommit(users.rhU1, (q) => log(q, users.rhU1, ORG_A, U1));
    const own = await as(users.rhU1, (q) => q("select count(*)::int as n from report_exports"));
    expect(own.rows[0].n).toBe(1);
    const admin = await as(users.adminA, (q) => q("select count(*)::int as n from report_exports"));
    expect(admin.rows[0].n).toBe(1);
    const other = await as(users.dpU1, (q) => q("select count(*)::int as n from report_exports"));
    expect(other.rows[0].n).toBe(0);
  });

  it("ninguém registra em nome de outro, em outra organização ou com unidade alheia", async () => {
    await expect(as(users.rhU1, (q) => log(q, users.dpU1, ORG_A, U1))).rejects.toThrow(/row-level security/);
    await expect(as(users.rhU1, (q) => log(q, users.rhU1, ORG_B, null))).rejects.toThrow(/row-level security/);
    await expect(as(users.rhU1, (q) => log(q, users.rhU1, ORG_A, B1))).rejects.toThrow(/row-level security/);
  });

  it("o registro não pode ser alterado nem apagado", async () => {
    await expect(as(users.adminA, (q) => q("delete from report_exports"))).rejects.toThrow(/permission denied/);
    await expect(as(users.rhU1, (q) => q("update report_exports set row_count = 0"))).rejects.toThrow(/permission denied/);
  });
});

describe("prévia de folha (dados de remuneração)", () => {
  beforeAll(async () => {
    // Como admin da organização A (a sessão anterior deixou as claims vazias).
    await asCommit(users.adminA, (q) => seedPayroll(q));
  });

  async function seedPayroll(q: Q) {
    // organization_id/unit_id errados de propósito: o trigger de escopo corrige.
    await q(
      `insert into employee_payroll_profile (employee_id, organization_id, unit_id, vt_enabled, vt_daily_amount, va_monthly)
       values ($1, $2, $3, true, 12.5, 600), ($4, $5, $6, false, 0, 450)`,
      [emp.colab1, ORG_B, B1, emp.colab2, ORG_A, U2],
    );
    await q(
      `insert into employee_payroll_items (employee_id, organization_id, unit_id, kind, code, description, amount, start_period)
       values ($1, $2, $3, 'desconto', 'EMPRESTIMO_CONSIGNADO', 'Consignado', 250, '2026-01')`,
      [emp.colab1, ORG_A, U1],
    );
    await q(
      `insert into payroll_entries (employee_id, organization_id, unit_id, period, code, quantity)
       values ($1, $2, $3, '2026-10', 'HE50', 6)`,
      [emp.colab1, ORG_A, U1],
    );
  }

  const count = (user: string | null, table: string) =>
    as(user, (q) => q(`select count(*)::int as n from ${table}`)).then((r) => r.rows[0].n as number);

  it("o trigger de escopo grava perfil na unidade do colaborador", async () => {
    const r = await db.query("select organization_id, unit_id from employee_payroll_profile where employee_id = $1", [emp.colab1]);
    expect(r.rows[0]).toEqual({ organization_id: ORG_A, unit_id: U1 });
  });

  it("RH da unidade 1 vê só a unidade 1; admin vê tudo; org B nada", async () => {
    expect(await count(users.rhU1, "employee_payroll_profile")).toBe(1);
    expect(await count(users.adminA, "employee_payroll_profile")).toBe(2);
    expect(await count(users.adminB, "employee_payroll_profile")).toBe(0);
    expect(await count(users.adminB, "payroll_entries")).toBe(0);
  });

  it("diretoria e gestor não veem remuneração; colaborador vê só a própria", async () => {
    for (const t of ["employee_payroll_profile", "employee_payroll_items", "payroll_entries"]) {
      expect(await count(users.diretoria, t)).toBe(0);
      expect(await count(users.gestor, t)).toBe(0);
    }
    expect(await count(users.colab1, "employee_payroll_profile")).toBe(1);
    expect(await count(users.colab1, "payroll_entries")).toBe(1);
    expect(await count(users.colab2, "payroll_entries")).toBe(0);
  });

  it("colaborador não altera o próprio perfil nem lança variáveis", async () => {
    const r = await as(users.colab1, (q) => q("update employee_payroll_profile set va_monthly = 9999 returning 1"));
    expect(r.rowCount).toBe(0);
    await expect(
      as(users.colab1, (q) =>
        q("insert into payroll_entries (employee_id, organization_id, unit_id, period, code, amount) values ($1, $2, $3, '2026-10', 'COMISSAO', 5000)", [
          emp.colab1, ORG_A, U1,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("DP da unidade 1 não lança variável para colaborador da unidade 2", async () => {
    await expect(
      as(users.dpU1, (q) =>
        q("insert into payroll_entries (employee_id, organization_id, unit_id, period, code, quantity) values ($1, $2, $3, '2026-10', 'HE50', 2)", [
          emp.colab2, ORG_A, U1,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("lançamento do mês não é editado, só excluído", async () => {
    await expect(as(users.dpU1, (q) => q("update payroll_entries set quantity = 60"))).rejects.toThrow(/permission denied/);
    const r = await as(users.dpU1, (q) => q("delete from payroll_entries where employee_id = $1 returning 1", [emp.colab1]));
    expect(r.rowCount).toBe(1);
  });

  it("tabelas de cálculo: membros leem, só admin/DP da organização altera", async () => {
    await asCommit(users.adminA, (q) =>
      q("insert into payroll_tax_tables (organization_id, kind, valid_from, data) values ($1, 'parametros', '2026-01-01', '{\"minimum_wage\": 1621}')", [ORG_A]),
    );
    expect(await count(users.dpU1, "payroll_tax_tables")).toBe(1);
    // Valores legais, não pessoais: o colaborador lê para calcular a própria prévia.
    expect(await count(users.colab1, "payroll_tax_tables")).toBe(1);
    expect(await count(users.gestor, "payroll_tax_tables")).toBe(1);
    await expect(
      as(users.colab1, (q) => q("update payroll_tax_tables set data = '{}' returning 1")).then((r) => r.rowCount),
    ).resolves.toBe(0);
    expect(await count(users.adminB, "payroll_tax_tables")).toBe(0);
    await expect(
      as(users.dpU1, (q) => q("insert into payroll_tax_tables (organization_id, kind, valid_from, data) values ($1, 'inss', '2026-02-01', '{}')", [ORG_A])),
    ).rejects.toThrow(/row-level security/);
  });

  it("colaborador lê a própria remuneração e dependentes, nunca a de outro", async () => {
    const own = await as(users.colab1, (q) =>
      q("select (select count(*) from employee_payroll_items)::int i, (select count(*) from employee_sensitive)::int s"),
    );
    expect(own.rows[0]).toEqual({ i: 1, s: 1 });
    const other = await as(users.colab2, (q) => q("select count(*)::int n from employee_payroll_items"));
    expect(other.rows[0].n).toBe(0);
  });

  it("auditoria registra a alteração de remuneração sem os valores", async () => {
    const r = await db.query(
      "select old_data, new_data from audit_log where table_name = 'employee_payroll_profile' and record_id = $1",
      [emp.colab1],
    );
    expect(r.rowCount).toBeGreaterThan(0);
    expect(r.rows.every((x) => x.old_data === null && x.new_data === null)).toBe(true);
  });
});

describe("documentos do RH e do DP", () => {
  const ins = (q: Q, area: string, unit: string | null, visibility = "restrito", org = ORG_A) =>
    q(
      `insert into org_documents (organization_id, unit_id, area, category, title, visibility, file_name, storage_path)
       values ($1::uuid, $2::uuid, $3, 'politica', 'Documento', $4, 'a.pdf', $5 || '/' || $3 || '/' || gen_random_uuid() || '-a.pdf') returning id`,
      [org, unit, area, visibility, org],
    );
  const count = (user: string) => as(user, (q) => q("select count(*)::int n from org_documents")).then((r) => r.rows[0].n as number);

  beforeAll(async () => {
    await asCommit(users.adminA, async (q) => {
      await ins(q, "rh", null, "todos"); // regulamento para todos
      await ins(q, "dp", null); // guia restrita
    });
    await asCommit(users.adminB, (q) => ins(q, "rh", null, "todos", ORG_B));
  });

  it("RH e DP de unidade enviam na própria área e unidade; não na área do outro", async () => {
    await expect(as(users.rhU1, (q) => ins(q, "rh", U1))).resolves.toBeTruthy();
    await expect(as(users.rhU1, (q) => ins(q, "dp", U1))).rejects.toThrow(/row-level security/);
    await expect(as(users.dpU1, (q) => ins(q, "dp", U1))).resolves.toBeTruthy();
    await expect(as(users.dpU1, (q) => ins(q, "dp", U2))).rejects.toThrow(/row-level security/);
    // Sem unidade = documento da organização inteira: exige papel org-wide.
    await expect(as(users.rhU1, (q) => ins(q, "rh", null))).rejects.toThrow(/row-level security/);
  });

  it("colaborador, gestor e diretoria não enviam", async () => {
    for (const u of [users.colab1, users.gestor, users.diretoria]) {
      await expect(as(u, (q) => ins(q, "rh", U1, "todos"))).rejects.toThrow(/row-level security/);
    }
  });

  it("equipe lê tudo da organização; demais só o que é visível a todos", async () => {
    expect(await count(users.rhU1)).toBe(2);
    expect(await count(users.dpU1)).toBe(2);
    expect(await count(users.colab1)).toBe(1);
    expect(await count(users.gestor)).toBe(1);
    expect(await count(users.diretoria)).toBe(1);
    expect(await count(users.adminB)).toBe(1); // só o da própria organização
  });

  it("arquivo fica na pasta da organização e da área; caminho não muda", async () => {
    await expect(
      as(users.adminA, (q) =>
        q(`insert into org_documents (organization_id, area, category, title, file_name, storage_path)
           values ($1, 'rh', 'politica', 'X', 'x.pdf', $2)`, [ORG_A, `${ORG_B}/rh/x.pdf`]),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      as(users.adminA, (q) => q("update org_documents set storage_path = storage_path || 'x'")),
    ).rejects.toThrow(/não mudam/);
  });

  it("colaborador não apaga documento visível a todos", async () => {
    const r = await as(users.colab1, (q) => q("delete from org_documents returning 1"));
    expect(r.rowCount).toBe(0);
  });
});

describe("comissões", () => {
  let planId = "";
  let saleId = "";
  beforeAll(async () => {
    await asCommit(users.adminA, async (q) => {
      planId = (await q("insert into commission_plans (organization_id, name, default_rate) values ($1, 'Vendas loja', 3) returning id", [ORG_A])).rows[0].id;
      await q("insert into employee_commission (employee_id, organization_id, unit_id, plan_id, monthly_target) values ($1, $2, $3, $4, 50000)", [emp.colab1, ORG_B, B1, planId]);
      saleId = (await q("insert into sales (employee_id, organization_id, unit_id, sale_date, order_number, category, amount) values ($1, $2, $3, '2026-10-05', 'P-1', 'planejados', 12000) returning id", [emp.colab1, ORG_A, U1])).rows[0].id;
      await q("insert into sale_payments (sale_id, organization_id, unit_id, paid_at, amount) values ($1, $2, $3, '2026-10-10', 4000)", [saleId, ORG_B, B1]);
    });
  });
  const count = (user: string, t: string) => as(user, (q) => q(`select count(*)::int n from ${t}`)).then((r) => r.rows[0].n as number);

  it("escopo vem do vendedor e da venda (organização/unidade enviadas são corrigidas)", async () => {
    const a = await db.query("select organization_id, unit_id from employee_commission where employee_id = $1", [emp.colab1]);
    const p = await db.query("select organization_id, unit_id from sale_payments where sale_id = $1", [saleId]);
    expect(a.rows[0]).toEqual({ organization_id: ORG_A, unit_id: U1 });
    expect(p.rows[0]).toEqual({ organization_id: ORG_A, unit_id: U1 });
  });

  it("RH/DP da unidade veem; outra unidade, gestor, diretoria e outra organização não", async () => {
    expect(await count(users.rhU1, "sales")).toBe(1);
    expect(await count(users.dpU1, "sale_payments")).toBe(1);
    for (const u of [users.gestor, users.diretoria, users.adminB, users.colab2]) {
      expect(await count(u, "sales")).toBe(0);
      expect(await count(u, "employee_commission")).toBe(0);
      expect(await count(u, "sale_payments")).toBe(0);
    }
  });

  it("vendedor lê as próprias vendas, recebimentos e meta, mas não altera", async () => {
    expect(await count(users.colab1, "sales")).toBe(1);
    expect(await count(users.colab1, "sale_payments")).toBe(1);
    expect(await count(users.colab1, "employee_commission")).toBe(1);
    const r = await as(users.colab1, (q) => q("update sales set amount = 999999 returning 1"));
    expect(r.rowCount).toBe(0);
    await expect(
      as(users.colab1, (q) => q("insert into sales (employee_id, organization_id, unit_id, sale_date, amount) values ($1, $2, $3, '2026-10-06', 5000)", [emp.colab1, ORG_A, U1])),
    ).rejects.toThrow(/row-level security/);
  });

  it("planos: membros leem; só Admin/RH/DP da organização inteira alteram", async () => {
    expect(await count(users.colab1, "commission_plans")).toBe(1);
    expect(await count(users.adminB, "commission_plans")).toBe(0);
    await expect(as(users.rhU1, (q) => q("insert into commission_plans (organization_id, name) values ($1, 'X')", [ORG_A]))).rejects.toThrow(/row-level security/);
  });

  it("mesmo pedido não entra duas vezes para o mesmo vendedor", async () => {
    await expect(
      as(users.adminA, (q) => q("insert into sales (employee_id, organization_id, unit_id, sale_date, order_number, amount) values ($1, $2, $3, '2026-10-07', 'P-1', 100)", [emp.colab1, ORG_A, U1])),
    ).rejects.toThrow(/duplicate key/);
  });

  it("DP da unidade 1 não lança venda de vendedor da unidade 2", async () => {
    await expect(
      as(users.dpU1, (q) => q("insert into sales (employee_id, organization_id, unit_id, sale_date, amount) values ($1, $2, $3, '2026-10-06', 100)", [emp.colab2, ORG_A, U1])),
    ).rejects.toThrow(/row-level security/);
  });
});
