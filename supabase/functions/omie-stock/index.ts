import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OMIE_API_URL = 'https://app.omie.com.br/api/v1';

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

function manausDateISO(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Manaus', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function toOmieDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

async function omieCall(path: string, call: string, param: unknown, key: string, secret: string, timeoutMs = 40000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OMIE_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call, app_key: key, app_secret: secret, param: [param] }),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }
    if (!json) throw new Error(`Resposta inválida da Omie (${res.status})`);
    if (json.faultstring) throw new Error(String(json.faultstring));
    return json;
  } finally {
    clearTimeout(timer);
  }
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

interface StockRow {
  code: string;
  name: string;
  family: string | null;
  unit: string | null;
  balance: number;
  physical: number;
  reserved: number;
  entries: number;
  exits: number;
}

async function fetchPosition(key: string, secret: string, dateISO: string) {
  const rows = new Map<string, StockRow>();
  let page = 1;
  let totalPages = 1;
  do {
    const json = await omieCall('/estoque/consulta/', 'ListarPosEstoque', {
      nPagina: page,
      nRegPorPagina: 500,
      dDataPosicao: toOmieDate(dateISO),
      cExibeTodos: 'S',
    }, key, secret);

    totalPages = Number(json.nTotPaginas ?? json.total_de_paginas ?? 1) || 1;
    const list: any[] = json.produtos ?? json.listaPosEstoque ?? json.produto_servico_resumo ?? [];
    for (const p of list) {
      const code = String(p.cCodigo ?? p.codigo ?? p.cCodInt ?? p.nCodProd ?? '').trim();
      if (!code) continue;
      const existing = rows.get(code);
      const row: StockRow = existing ?? {
        code,
        name: String(p.cDescricao ?? p.descricao ?? code).trim(),
        family: p.cDescrFamilia ? String(p.cDescrFamilia) : (p.cCodFamilia ? String(p.cCodFamilia) : null),
        unit: p.cUnidade ? String(p.cUnidade) : null,
        balance: 0, physical: 0, reserved: 0, entries: 0, exits: 0,
      };
      row.physical += num(p.fisico ?? p.nFisico ?? p.estoque_fisico);
      row.reserved += num(p.reservado ?? p.nReservado);
      row.balance += num(p.saldo ?? p.nSaldo ?? p.fisico ?? p.nFisico);
      rows.set(code, row);
    }
    page++;
  } while (page <= totalPages && page <= 12);
  return rows;
}

async function fetchMovements(key: string, secret: string, fromISO: string, toISO: string, rows: Map<string, StockRow>) {
  const attempts: Array<{ path: string; call: string; param: Record<string, unknown> }> = [
    { path: '/estoque/movestoque/', call: 'ListarMovimentos', param: { nPagina: 1, nRegPorPagina: 500, dDtMovimentoDe: toOmieDate(fromISO), dDtMovimentoAte: toOmieDate(toISO) } },
    { path: '/estoque/ajuste/', call: 'ListarAjustes', param: { nPagina: 1, nRegPorPagina: 500, dDtAjusteDe: toOmieDate(fromISO), dDtAjusteAte: toOmieDate(toISO) } },
  ];

  let lastError = '';
  for (const attempt of attempts) {
    try {
      let page = 1;
      let totalPages = 1;
      let matched = 0;
      do {
        const json = await omieCall(attempt.path, attempt.call, { ...attempt.param, nPagina: page }, key, secret);
        totalPages = Number(json.nTotPaginas ?? json.total_de_paginas ?? 1) || 1;
        const list: any[] = json.cadastros ?? json.movimentos ?? json.ajustes ?? json.listaMovimentos ?? [];
        for (const m of list) {
          const code = String(m.cCodigo ?? m.codigo_produto ?? m.cCodInt ?? m.nCodProd ?? m.codigo ?? '').trim();
          if (!code) continue;
          const qty = Math.abs(num(m.nQtde ?? m.quantidade ?? m.nQuantidade));
          if (!qty) continue;
          const kind = String(m.cCodOper ?? m.tipo ?? m.cTipo ?? m.cOperacao ?? '').toUpperCase();
          const isEntry = kind.includes('ENT') || kind.startsWith('E') || num(m.nQtde ?? m.quantidade) > 0;
          const row = rows.get(code);
          if (!row) continue;
          matched++;
          if (isEntry) row.entries += qty; else row.exits += qty;
        }
        page++;
      } while (page <= totalPages && page <= 12);
      console.log(`Movimentos via ${attempt.call}: ${matched} itens casados`);
      return { ok: true, source: attempt.call, matched };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.log(`Falha em ${attempt.call}: ${lastError}`);
    }
  }
  return { ok: false, error: lastError };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const sb = getSupabase();
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: roles } = await sb.from('user_roles').select('role').eq('user_id', userData.user.id);
    const isAdmin = (roles ?? []).some((r: any) => r.role === 'admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Acesso restrito ao administrador' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const companyId = body?.companyId;
    const dateFrom: string = body?.dateFrom || manausDateISO();
    const dateTo: string = body?.dateTo || manausDateISO();

    if (!companyId || typeof companyId !== 'string') {
      return new Response(JSON.stringify({ error: 'companyId obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return new Response(JSON.stringify({ error: 'Datas inválidas' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: company } = await sb.from('companies').select('id, slug, name, has_expedition').eq('id', companyId).maybeSingle();
    if (!company) {
      return new Response(JSON.stringify({ error: 'Empresa não encontrada' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!company.has_expedition) {
      return new Response(JSON.stringify({ error: 'Estoque disponível apenas nas empresas com expedição' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const suffix = company.slug === 'stock360' ? '' : `_${String(company.slug).toUpperCase()}`;
    const key = Deno.env.get(`OMIE_APP_KEY${suffix}`);
    const secret = Deno.env.get(`OMIE_APP_SECRET${suffix}`);
    if (!key || !secret) throw new Error(`Credenciais Omie não configuradas para ${company.name}`);

    const cacheKey = `${company.slug}:stock_${dateFrom}_${dateTo}`;
    if (!body?.forceRefresh) {
      const { data: cached } = await sb.from('omie_cache').select('cache_value, expires_at, created_at').eq('cache_key', cacheKey).maybeSingle();
      if (cached && new Date(cached.expires_at) > new Date()) {
        return new Response(JSON.stringify({ ...(cached.cache_value as any), fromCache: true, cachedAt: cached.created_at }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const rows = await fetchPosition(key, secret, dateTo);
    const movements = await fetchMovements(key, secret, dateFrom, dateTo, rows);

    const result = {
      companySlug: company.slug,
      dateFrom,
      dateTo,
      products: Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      movementsAvailable: movements.ok && ((movements as any).matched ?? 0) > 0,
      movementsError: movements.ok ? null : (movements as any).error ?? null,
      generatedAt: new Date().toISOString(),
    };

    await sb.from('omie_cache').upsert({
      cache_key: cacheKey,
      cache_value: result,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }, { onConflict: 'cache_key' });

    return new Response(JSON.stringify({ ...result, fromCache: false, cachedAt: result.generatedAt }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('omie-stock error:', message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
