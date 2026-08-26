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
