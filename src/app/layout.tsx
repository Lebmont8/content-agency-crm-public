import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getI18n } from "@/i18n";
import { I18nProvider } from "@/i18n/provider";
const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});
const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});
export const metadata: Metadata = {
    title: {
        default: "Vexora",
        template: "%s · Vexora",
    },
    description: "Secure creator operations, conversations and revenue in one workspace.",
};
export default async function RootLayout({ children, }: Readonly<{
    children: React.ReactNode;
}>) {
    const { locale, dict } = await getI18n();
    return (<html lang={locale} className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}>
        <I18nProvider locale={locale} dict={dict}>
          {children}
        </I18nProvider>
      </body>
    </html>);
}
