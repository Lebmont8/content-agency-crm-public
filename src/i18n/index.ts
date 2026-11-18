import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { en, type Dictionary } from "./en";
import { ru } from "./ru";
const DICTS: Record<Locale, Dictionary> = { en, ru };
export const getLocale = cache(async (): Promise<Locale> => {
    const jar = await cookies();
    const value = jar.get(LOCALE_COOKIE)?.value;
    return isLocale(value) ? value : DEFAULT_LOCALE;
});
export function getDictionary(locale: Locale): Dictionary {
    return DICTS[locale];
}
export async function getI18n(): Promise<{
    locale: Locale;
    dict: Dictionary;
}> {
    const locale = await getLocale();
    return { locale, dict: DICTS[locale] };
}
export type { Dictionary } from "./en";
