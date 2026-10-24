-- ===========================================================================
-- Comissões de vendedores.
--   commission_plans     regras: base (venda ou recebimento), % padrão, faixas por
--                        atingimento de meta e % por categoria de produto
--   employee_commission  vendedor → plano, meta mensal e % próprio (opcional)
--   sales                vendas (digitadas ou importadas), por vendedor
--   sale_payments        recebimentos das vendas (base "recebimento")
-- Valores de comissão são remuneração: Admin/RH/DP da unidade e o próprio
-- vendedor (leitura). Gestor e diretoria não veem.
-- ===========================================================================

create table public.commission_plans (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null check (length(trim(name)) between 2 and 80),
  base             text not null default 'venda' check (base in ('venda','recebimento')),
  default_rate     numeric(6,3) not null default 0 check (default_rate between 0 and 100),
  -- [{ "from": 80, "rate": 3 }, ...]: a partir de X% da meta, vale a taxa.
  tiers            jsonb not null default '[]'::jsonb check (jsonb_typeof(tiers) = 'array'),
  -- { "planejados": 3, "acessorios": 5 }: taxa por categoria (prevalece sobre as demais).
  category_rates   jsonb not null default '{}'::jsonb check (jsonb_typeof(category_rates) = 'object'),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.employee_commission (
  employee_id      uuid primary key references public.employees(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  unit_id          uuid not null references public.units(id) on delete restrict,
  plan_id          uuid not null references public.commission_plans(id) on delete restrict,
  monthly_target   numeric(14,2) check (monthly_target is null or monthly_target >= 0),
  rate_override    numeric(6,3) check (rate_override is null or rate_override between 0 and 100),
  active           boolean not null default true,
  updated_at       timestamptz not null default now()
);

create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  unit_id          uuid not null references public.units(id) on delete restrict,
  employee_id      uuid not null references public.employees(id) on delete restrict,
  sale_date        date not null,
  order_number     text check (order_number is null or length(order_number) between 1 and 60),
  customer         text check (customer is null or length(customer) <= 120),
  category         text not null default 'geral' check (category ~ '^[a-z0-9_]{2,40}$'),
  amount           numeric(14,2) not null check (amount > 0),
  status           text not null default 'ativa' check (status in ('ativa','cancelada')),
  source           text not null default 'manual' check (source in ('manual','importacao')),
  created_by       uuid references auth.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index sales_org_date_idx on public.sales (organization_id, sale_date);
create index sales_employee_idx on public.sales (employee_id, sale_date);
-- O mesmo pedido não entra duas vezes para o mesmo vendedor (reimportação segura).
create unique index sales_order_unique on public.sales (organization_id, employee_id, order_number) where order_number is not null;

create table public.sale_payments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  unit_id          uuid not null references public.units(id) on delete restrict,
  sale_id          uuid not null references public.sales(id) on delete cascade,
  paid_at          date not null,
  amount           numeric(14,2) not null check (amount > 0),
  created_by       uuid references auth.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (sale_id, paid_at, amount)
);
create index sale_payments_org_paid_idx on public.sale_payments (organization_id, paid_at);

-- Escopo vindo do vendedor (vendas, atribuição) e da venda (recebimentos).
create or replace function private.scope_from_sale()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_unit uuid;
begin
  select s.organization_id, s.unit_id into v_org, v_unit from public.sales s where s.id = new.sale_id;
  if v_org is null then
    raise exception 'Venda não encontrada' using errcode = 'foreign_key_violation';
  end if;
  new.organization_id := v_org;
  new.unit_id := v_unit;
  return new;
end;
$$;

-- Plano precisa ser da mesma organização do vendedor.
create or replace function private.commission_assignment_rules()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- Compara com a organização do colaborador (não depende da ordem dos gatilhos de escopo).
  if not exists (
    select 1 from public.commission_plans p join public.employees e on e.id = new.employee_id
    where p.id = new.plan_id and p.organization_id = e.organization_id
  ) then
    raise exception 'Plano de comissão de outra organização' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['employee_commission','sales'] loop
    execute format('create trigger %I before insert or update of employee_id on public.%I
                    for each row execute function private.scope_from_employee()', t || '_scope', t);
  end loop;
  foreach t in array array['commission_plans','employee_commission','sales'] loop
    execute format('create trigger %I before update on public.%I
                    for each row execute function private.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['commission_plans','employee_commission','sales','sale_payments'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function private.audit_row()', t || '_audit', t);
  end loop;
end $$;
create trigger sale_payments_scope before insert or update of sale_id on public.sale_payments
  for each row execute function private.scope_from_sale();
create trigger employee_commission_rules before insert or update on public.employee_commission
  for each row execute function private.commission_assignment_rules();

grant select, insert, update, delete on public.commission_plans, public.employee_commission, public.sales, public.sale_payments to authenticated;
grant all on public.commission_plans, public.employee_commission, public.sales, public.sale_payments to service_role;
alter table public.commission_plans    enable row level security;
alter table public.employee_commission enable row level security;
alter table public.sales               enable row level security;
alter table public.sale_payments       enable row level security;

-- Planos: regras gerais, sem valor pessoal. Membros leem; Admin/RH/DP da organização mantêm.
create policy commission_plans_select on public.commission_plans for select to authenticated
  using (private.is_member(organization_id));
create policy commission_plans_write on public.commission_plans for all to authenticated
  using (private.has_org_wide_role(organization_id, array['admin','rh','dp']))
  with check (private.has_org_wide_role(organization_id, array['admin','rh','dp']));

-- Atribuição, vendas e recebimentos: Admin/RH/DP da unidade; o vendedor lê os próprios.
create policy employee_commission_select on public.employee_commission for select to authenticated
  using (private.can_manage_people(organization_id, unit_id) or private.is_self(employee_id));
create policy employee_commission_write on public.employee_commission for all to authenticated
  using (private.can_manage_people(organization_id, unit_id))
  with check (private.can_manage_people(organization_id, unit_id));

create policy sales_select on public.sales for select to authenticated
  using (private.can_manage_people(organization_id, unit_id) or private.is_self(employee_id));
create policy sales_write on public.sales for all to authenticated
  using (private.can_manage_people(organization_id, unit_id))
  with check (private.can_manage_people(organization_id, unit_id));

create policy sale_payments_select on public.sale_payments for select to authenticated
  using (
    private.can_manage_people(organization_id, unit_id)
    or exists (select 1 from public.sales s where s.id = sale_id and private.is_self(s.employee_id))
  );
create policy sale_payments_write on public.sale_payments for all to authenticated
  using (private.can_manage_people(organization_id, unit_id))
  with check (private.can_manage_people(organization_id, unit_id));
