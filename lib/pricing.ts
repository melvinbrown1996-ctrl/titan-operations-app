export const BASE_SERVICE_RATES = {
  "New Honda Detail": 150,
  "New Acura Detail": 150,
  "Used Car Detail": 150,
  Refresh: 65,
} as const;

export const APPEARANCE_PROTECTION = "Appearance Protection";
export const APPEARANCE_PROTECTION_RATE = 125;

export const BASE_SERVICE_OPTIONS = Object.keys(BASE_SERVICE_RATES) as Array<keyof typeof BASE_SERVICE_RATES>;

export function calculateServiceRevenue(services: string[]) {
  const baseServices = services.filter((service): service is keyof typeof BASE_SERVICE_RATES => service in BASE_SERVICE_RATES);
  const hasAppearanceProtection = services.includes(APPEARANCE_PROTECTION);
  const allowed = new Set([...BASE_SERVICE_OPTIONS, APPEARANCE_PROTECTION]);
  if (baseServices.length !== 1 || services.some((service) => !allowed.has(service))) return null;
  return {
    service: [...baseServices, ...(hasAppearanceProtection ? [APPEARANCE_PROTECTION] : [])].join(", "),
    baseAmount: BASE_SERVICE_RATES[baseServices[0]],
    addOnAmount: hasAppearanceProtection ? APPEARANCE_PROTECTION_RATE : 0,
  };
}
