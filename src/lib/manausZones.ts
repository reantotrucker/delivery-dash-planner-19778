// Zonas administrativas de Manaus por bairro (com variações de escrita comuns nas notas).
export type ZonaManaus = 'Sul' | 'Centro-Sul' | 'Centro-Oeste' | 'Oeste' | 'Norte' | 'Leste' | 'Rural';

export const ZONA_ORDER: ZonaManaus[] = ['Sul', 'Centro-Sul', 'Centro-Oeste', 'Oeste', 'Norte', 'Leste', 'Rural'];

export const normalizeBairro = (s?: string | null) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.\-–_/,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Ordem importa: regras mais específicas primeiro.
const RULES: Array<[RegExp, ZonaManaus]> = [
  [/ZONA RURAL|AREA RURAL|RAMAL|IRANDUBA|CACAU PIRERA|MANACAPURU|COMUNIDADE|BOCA DO RIO/, 'Rural'],
  [/^(DISTRITO|DIST|DISTRIT|DSITRITO) INDUSTRIAL (II|2)\b/, 'Leste'],
  [/^(DISTRITO|DIST|DISTRIT|DSITRITO)( INDUSTRIAL)?( (I|1))?$|^INDUSTRIAL$/, 'Sul'],
  [/COLONIA ANTONIO ALEIXO/, 'Leste'],
  [/COLONIA (SANTO|STO) ANTONIO/, 'Norte'],
  [/COLONIA TERRA NOVA|^TERRA NOVA/, 'Norte'],
  [/COLONIA OLIVEIRA MACHADO/, 'Sul'],
  [/^NOVO ALEIXO/, 'Norte'],
  [/^S(AO)? JOSE|^SAO JOSE OPERARIO/, 'Leste'],
  [/^JORGE TE(I)?XEIRA/, 'Leste'],
  [/^ZUMBI/, 'Leste'],
  [/^(ARMANDO MENDES|COROADO|GILBERTO MESTRINHO|MAUAZINHO|PURAQUEQUARA|TA?N?CREDO NEVES)/, 'Leste'],
  [/^(CIDADE NOVA|NOVA CIDADE|CIDADE DE DEUS|LAGO AZUL|S(AN)?TA ETELVINA|NOVO ISRAEL|MONTES? DAS OLIVEIRA|MANOA)/, 'Norte'],
  [/^(COMPENSA|TARUMA|PONTA NEGRA|SANTO AGOSTINHO|SANTO ANTONIO|SAO JORGE|SAO RAIMUNDO|GLORIA|VILA DA PRATA|LIRIO DO VALE|NOVA ESPERANCA)/, 'Oeste'],
  [/^(ALVORADA|DA PAZ|BAIRRO DA PAZ|PAZ|DOM PEDRO|D PEDRO|PLANALTO|REDENCAO)/, 'Centro-Oeste'],
  [/^(PARQUE (10|DEZ)|PQ (10|DEZ)|PRQ (10|DEZ)|PARQUE DAS LARA)/, 'Centro-Sul'],
  [/^(NOS?SA SENHORA DAS GRACAS|NOSSA SRA DAS GRACAS|N S(RA)? DAS GRACAS|N SRA DAS GRACAS|N SENHORA DAS GRACAS)/, 'Centro-Sul'],
  [/^(ADRIANOPOLIS|ALEIXO|CHAPADA|FLORES\b|S(AO)? GERALDO|VI?E?I?RALV?E?S|VIEIRA ALVES|BANCARIOS)/, 'Centro-Sul'],
  [/^(PRACA 14|PCA 14|PRES(IDENTE)? VARGAS)/, 'Sul'],
  [/^(CENTRO|CA(C)?H?OEIRI?NHA|CAHOEIRINHA|CACHOEIRNHA|EDUCANDOS|RAIZ|SAO FRANCISCO|JAPIII?M|PETROPOLIS|BETANIA|CRESPO|MORRO DA LIBERDADE|LIBERDADE|SANTA LUZIA|S(AO)? LAZARO|CONJUNTO ATILIO ANDREAZZA|VILA BURITI|NOSSA SENHORA APARECIDA|APARECIDA)/, 'Sul'],
];

export function zonaManaus(bairro?: string | null): ZonaManaus | null {
  const n = normalizeBairro(bairro);
  if (!n || n === 'N A') return null;
  for (const [re, z] of RULES) if (re.test(n)) return z;
  return null;
}
