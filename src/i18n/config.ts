export const LOCALES = ["en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";
export const LOCALE_LABELS: Record<Locale, string> = {
    en: "EN",
    ru: "RU",
};
export function isLocale(v: string | undefined | null): v is Locale {
    return v === "en" || v === "ru";
}
