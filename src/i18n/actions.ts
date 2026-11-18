"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isLocale, LOCALE_COOKIE, type Locale } from "./config";
export async function setLocale(locale: Locale): Promise<void> {
    if (!isLocale(locale))
        return;
    const jar = await cookies();
    jar.set(LOCALE_COOKIE, locale, {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
    });
    revalidatePath("/", "layout");
}
