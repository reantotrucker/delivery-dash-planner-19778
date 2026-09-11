const STORAGE_KEY = "active_company_id";

let current: string = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
})();

export const getActiveCompanyId = (): string => current;

export const setActiveCompanyId = (id: string) => {
  current = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
};

const SLUG_KEY = "active_company_slug";

let currentSlug: string = (() => {
  try {
    return localStorage.getItem(SLUG_KEY) || "";
  } catch {
    return "";
  }
})();

export const getActiveCompanySlug = (): string => currentSlug;

export const setActiveCompanySlug = (slug: string) => {
  currentSlug = slug;
  try {
    localStorage.setItem(SLUG_KEY, slug);
  } catch {
    /* ignore */
  }
};

/** Cidade/UF usada em links de navegação e geocoding, conforme a empresa ativa */
export const getActiveCity = (): { city: string; state: string } =>
  currentSlug === "uniprint_bv"
    ? { city: "Boa Vista", state: "RR" }
    : { city: "Manaus", state: "AM" };
