/**
 * Seed de categorias pt-BR para área médica + finanças pessoais.
 *
 * Estrutura hierárquica: parent (slug) → children (slugs).
 * - `deductible_carne_leao=true`: gastos dedutíveis no carnê-leão (médicos PJ/autônomos).
 * - `is_system=true`: categorias seedadas pelo sistema (não devem ser deletadas via UI comum).
 *
 * Sort order é incremental por bloco (10, 20, 30...) para permitir inserções entre.
 */

export type SeedCategory = {
  slug: string;
  name: string;
  type: "income" | "expense" | "transfer";
  icon?: string;
  color?: string;
  deductible_carne_leao?: boolean;
  parent_slug?: string;
  sort_order: number;
};

export const SEED_CATEGORIES: SeedCategory[] = [
  // ============================================================
  // INCOME (receitas)
  // ============================================================
  {
    slug: "receita-plantoes",
    name: "Plantões",
    type: "income",
    icon: "stethoscope",
    color: "#10b981",
    sort_order: 10,
  },
  {
    slug: "receita-consultorio",
    name: "Consultório",
    type: "income",
    icon: "briefcase-medical",
    color: "#10b981",
    sort_order: 20,
  },
  {
    slug: "receita-procedimentos",
    name: "Procedimentos / Exames",
    type: "income",
    icon: "activity",
    color: "#10b981",
    sort_order: 30,
  },
  {
    slug: "receita-hospital-pj",
    name: "Hospital (PJ)",
    type: "income",
    icon: "building-2",
    color: "#10b981",
    sort_order: 40,
  },
  {
    slug: "receita-aulas-palestras",
    name: "Aulas / Palestras",
    type: "income",
    icon: "presentation",
    color: "#10b981",
    sort_order: 50,
  },
  {
    slug: "receita-pericia",
    name: "Perícia / Laudos",
    type: "income",
    icon: "file-check",
    color: "#10b981",
    sort_order: 60,
  },
  {
    slug: "receita-investimentos",
    name: "Rendimentos / Investimentos",
    type: "income",
    icon: "trending-up",
    color: "#0ea5e9",
    sort_order: 70,
  },
  {
    slug: "receita-outros",
    name: "Outras receitas",
    type: "income",
    icon: "plus-circle",
    color: "#64748b",
    sort_order: 999,
  },

  // ============================================================
  // EXPENSES — DESPESAS PROFISSIONAIS (dedutíveis carnê-leão)
  // ============================================================
  {
    slug: "prof-aluguel-consultorio",
    name: "Aluguel de consultório",
    type: "expense",
    icon: "key",
    color: "#8b5cf6",
    deductible_carne_leao: true,
    sort_order: 100,
  },
  {
    slug: "prof-secretaria",
    name: "Secretária / Equipe",
    type: "expense",
    icon: "users",
    color: "#8b5cf6",
    deductible_carne_leao: true,
    sort_order: 110,
  },
  {
    slug: "prof-equipamentos",
    name: "Equipamentos médicos",
    type: "expense",
    icon: "monitor",
    color: "#8b5cf6",
    deductible_carne_leao: true,
    sort_order: 120,
  },
  {
    slug: "prof-material-consumo",
    name: "Material de consumo (clínico)",
    type: "expense",
    icon: "package",
    color: "#8b5cf6",
    deductible_carne_leao: true,
    sort_order: 130,
  },
  {
    slug: "prof-conselho-crm",
    name: "Anuidade CRM / Conselho",
    type: "expense",
    icon: "badge-check",
    color: "#8b5cf6",
    deductible_carne_leao: true,
    sort_order: 140,
  },
  {
    slug: "prof-cursos-congressos",
    name: "Cursos / Congressos",
    type: "expense",
    icon: "graduation-cap",
    color: "#8b5cf6",
    deductible_carne_leao: true,
    sort_order: 150,
  },
  {
    slug: "prof-livros-publicacoes",
    name: "Livros / Publicações científicas",
    type: "expense",
    icon: "book-open",
    color: "#8b5cf6",
    deductible_carne_leao: true,
    sort_order: 160,
  },
  {
    slug: "prof-software-medico",
    name: "Software médico / Prontuário",
    type: "expense",
    icon: "laptop",
    color: "#8b5cf6",
    deductible_carne_leao: true,
    sort_order: 170,
  },
  {
    slug: "prof-contador",
    name: "Contador / Honorários",
    type: "expense",
    icon: "calculator",
    color: "#8b5cf6",
    deductible_carne_leao: true,
    sort_order: 180,
  },
  {
    slug: "prof-seguro-responsabilidade",
    name: "Seguro de responsabilidade civil",
    type: "expense",
    icon: "shield",
    color: "#8b5cf6",
    deductible_carne_leao: true,
    sort_order: 190,
  },
  {
    slug: "prof-transporte-trabalho",
    name: "Transporte profissional",
    type: "expense",
    icon: "car",
    color: "#8b5cf6",
    deductible_carne_leao: true,
    sort_order: 200,
  },

  // ============================================================
  // EXPENSES — IMPOSTOS / TRIBUTOS
  // ============================================================
  {
    slug: "impostos-irpf",
    name: "IRPF / Carnê-leão",
    type: "expense",
    icon: "landmark",
    color: "#dc2626",
    sort_order: 300,
  },
  {
    slug: "impostos-inss",
    name: "INSS",
    type: "expense",
    icon: "landmark",
    color: "#dc2626",
    sort_order: 310,
  },
  {
    slug: "impostos-iptu",
    name: "IPTU / IPVA",
    type: "expense",
    icon: "landmark",
    color: "#dc2626",
    sort_order: 320,
  },

  // ============================================================
  // EXPENSES — MORADIA
  // ============================================================
  {
    slug: "moradia-aluguel",
    name: "Aluguel / Financiamento",
    type: "expense",
    icon: "home",
    color: "#f59e0b",
    sort_order: 400,
  },
  {
    slug: "moradia-condominio",
    name: "Condomínio",
    type: "expense",
    icon: "building",
    color: "#f59e0b",
    sort_order: 410,
  },
  {
    slug: "moradia-energia",
    name: "Energia elétrica",
    type: "expense",
    icon: "zap",
    color: "#f59e0b",
    sort_order: 420,
  },
  {
    slug: "moradia-agua",
    name: "Água / Esgoto",
    type: "expense",
    icon: "droplet",
    color: "#f59e0b",
    sort_order: 430,
  },
  {
    slug: "moradia-internet",
    name: "Internet / Telefone",
    type: "expense",
    icon: "wifi",
    color: "#f59e0b",
    sort_order: 440,
  },
  {
    slug: "moradia-manutencao",
    name: "Manutenção / Reformas",
    type: "expense",
    icon: "hammer",
    color: "#f59e0b",
    sort_order: 450,
  },

  // ============================================================
  // EXPENSES — ALIMENTAÇÃO
  // ============================================================
  {
    slug: "alimentacao-mercado",
    name: "Mercado / Supermercado",
    type: "expense",
    icon: "shopping-cart",
    color: "#22c55e",
    sort_order: 500,
  },
  {
    slug: "alimentacao-restaurantes",
    name: "Restaurantes",
    type: "expense",
    icon: "utensils",
    color: "#22c55e",
    sort_order: 510,
  },
  {
    slug: "alimentacao-delivery",
    name: "Delivery (iFood, Rappi)",
    type: "expense",
    icon: "moped",
    color: "#22c55e",
    sort_order: 520,
  },

  // ============================================================
  // EXPENSES — TRANSPORTE
  // ============================================================
  {
    slug: "transporte-combustivel",
    name: "Combustível",
    type: "expense",
    icon: "fuel",
    color: "#3b82f6",
    sort_order: 600,
  },
  {
    slug: "transporte-app",
    name: "Uber / 99 / Apps",
    type: "expense",
    icon: "car-taxi-front",
    color: "#3b82f6",
    sort_order: 610,
  },
  {
    slug: "transporte-manutencao",
    name: "Manutenção veículo",
    type: "expense",
    icon: "wrench",
    color: "#3b82f6",
    sort_order: 620,
  },
  {
    slug: "transporte-estacionamento",
    name: "Estacionamento / Pedágio",
    type: "expense",
    icon: "parking-circle",
    color: "#3b82f6",
    sort_order: 630,
  },

  // ============================================================
  // EXPENSES — SAÚDE PESSOAL
  // ============================================================
  {
    slug: "saude-plano",
    name: "Plano de saúde",
    type: "expense",
    icon: "heart-pulse",
    color: "#ef4444",
    sort_order: 700,
  },
  {
    slug: "saude-farmacia",
    name: "Farmácia / Medicamentos",
    type: "expense",
    icon: "pill",
    color: "#ef4444",
    sort_order: 710,
  },
  {
    slug: "saude-academia",
    name: "Academia / Esportes",
    type: "expense",
    icon: "dumbbell",
    color: "#ef4444",
    sort_order: 720,
  },

  // ============================================================
  // EXPENSES — LAZER / EDUCAÇÃO PESSOAL
  // ============================================================
  {
    slug: "lazer-streaming",
    name: "Assinaturas / Streaming",
    type: "expense",
    icon: "tv",
    color: "#a855f7",
    sort_order: 800,
  },
  {
    slug: "lazer-viagens",
    name: "Viagens / Hospedagem",
    type: "expense",
    icon: "plane",
    color: "#a855f7",
    sort_order: 810,
  },
  {
    slug: "lazer-eventos",
    name: "Cinema / Eventos",
    type: "expense",
    icon: "ticket",
    color: "#a855f7",
    sort_order: 820,
  },
  {
    slug: "educacao-pessoal",
    name: "Educação (não-profissional)",
    type: "expense",
    icon: "book",
    color: "#a855f7",
    sort_order: 830,
  },

  // ============================================================
  // EXPENSES — OUTROS
  // ============================================================
  {
    slug: "vestuario",
    name: "Vestuário",
    type: "expense",
    icon: "shirt",
    color: "#ec4899",
    sort_order: 900,
  },
  {
    slug: "presentes-doacoes",
    name: "Presentes / Doações",
    type: "expense",
    icon: "gift",
    color: "#ec4899",
    sort_order: 910,
  },
  {
    slug: "tarifas-bancarias",
    name: "Tarifas bancárias / Juros",
    type: "expense",
    icon: "banknote",
    color: "#64748b",
    sort_order: 920,
  },
  {
    slug: "outras-despesas",
    name: "Outras despesas",
    type: "expense",
    icon: "more-horizontal",
    color: "#64748b",
    sort_order: 999,
  },

  // ============================================================
  // TRANSFER
  // ============================================================
  {
    slug: "transferencia",
    name: "Transferência entre contas",
    type: "transfer",
    icon: "arrow-left-right",
    color: "#94a3b8",
    sort_order: 1000,
  },
  {
    slug: "investimento-aporte",
    name: "Aporte em investimento",
    type: "transfer",
    icon: "piggy-bank",
    color: "#94a3b8",
    sort_order: 1010,
  },
];
