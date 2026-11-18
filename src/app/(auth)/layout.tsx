import { getI18n } from "@/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { BrandLockup } from "@/components/brand";
import { BarChart3, MessageSquareText, ShieldCheck } from "lucide-react";
export default async function AuthLayout({ children, }: {
    children: React.ReactNode;
}) {
    const { dict } = await getI18n();
    const features = [
        { icon: MessageSquareText, label: dict.auth.workspaceFeatureInbox },
        { icon: BarChart3, label: dict.auth.workspaceFeatureRevenue },
        { icon: ShieldCheck, label: dict.auth.workspaceFeatureSecurity },
    ];
    return (<div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-primary/10 blur-3xl"/>
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-fuchsia-500/[0.07] blur-3xl"/>
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <LanguageSwitcher />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
        <section className="hidden border-r border-border/70 px-12 py-10 lg:flex lg:flex-col lg:justify-between xl:px-20">
          <BrandLockup name={dict.common.appName} subtitle={dict.common.tagline}/>
          <div className="max-w-xl pb-8">
            <div className="mb-6 inline-flex rounded-full border border-primary/25 bg-primary/[0.08] px-3 py-1 text-xs font-medium text-primary">
              {dict.auth.workspaceEyebrow}
            </div>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.045em] xl:text-5xl">
              {dict.auth.workspaceTitle}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted">
              {dict.auth.workspaceDesc}
            </p>
            <div className="mt-8 grid gap-3">
              {features.map(({ icon: Icon, label }) => (<div key={label} className="flex items-center gap-3 text-sm text-foreground/85">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-2 text-primary">
                    <Icon className="h-4 w-4" strokeWidth={1.8}/>
                  </span>
                  {label}
                </div>))}
            </div>
          </div>
          <p className="text-xs text-muted">{dict.auth.workspaceFootnote}</p>
        </section>

        <section className="flex items-center justify-center px-4 py-20 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-7 lg:hidden">
              <BrandLockup name={dict.common.appName} subtitle={dict.common.tagline}/>
            </div>
            {children}
          </div>
        </section>
      </div>
    </div>);
}
