"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin, setAgencyStatus, updateAgencyPricing, confirmPayment, setAgencyPilotEnabled, updateCreatorPilotPolicy } from "@/lib/admin";
export async function suspendAgency(formData: FormData): Promise<void> {
    const admin = await requirePlatformAdmin();
    const data = z
        .object({ agencyId: z.string().min(1), suspend: z.enum(["true", "false"]) })
        .parse(Object.fromEntries(formData));
    await setAgencyStatus(data.agencyId, data.suspend === "true", admin.user.id);
    revalidatePath("/admin");
}
export async function confirmAgencyPayment(formData: FormData): Promise<void> {
    const admin = await requirePlatformAdmin();
    const agencyId = z.string().min(1).parse(formData.get("agencyId"));
    await confirmPayment(agencyId, admin.user.id);
    revalidatePath("/admin");
}
export async function updatePricing(formData: FormData): Promise<void> {
    const admin = await requirePlatformAdmin();
    const data = z
        .object({
        agencyId: z.string().min(1),
        assistPercent: z.coerce.number().int().min(0).max(100),
        autoPercent: z.coerce.number().int().min(0).max(100),
        perModelFeeDollars: z.coerce.number().min(0).max(100000),
    })
        .parse(Object.fromEntries(formData));
    await updateAgencyPricing(data.agencyId, {
        assistPercent: data.assistPercent,
        autoPercent: data.autoPercent,
        perModelFeeCents: Math.round(data.perModelFeeDollars * 100),
    }, admin.user.id);
    revalidatePath("/admin");
}
export async function toggleAgencyPilot(formData: FormData): Promise<void> {
    const admin = await requirePlatformAdmin();
    const data = z
        .object({ agencyId: z.string().min(1), enabled: z.enum(["true", "false"]) })
        .parse(Object.fromEntries(formData));
    await setAgencyPilotEnabled(data.agencyId, data.enabled === "true", admin.user.id);
    revalidatePath("/admin");
}
export async function saveCreatorPilotPolicy(formData: FormData): Promise<void> {
    const admin = await requirePlatformAdmin();
    const data = z
        .object({
        agencyId: z.string().min(1),
        accountId: z.string().min(1),
        pilotMode: z.enum(["OFF", "SHADOW", "ASSIST", "AUTO"]),
        complianceApproved: z.preprocess((value) => value === "on" || value === true, z.boolean()),
        dailyAiRunLimit: z.coerce.number().int().min(0).max(100000),
        dailyAiCostDollars: z.coerce.number().min(0).max(1000),
    })
        .superRefine((value, ctx) => {
        if (value.pilotMode !== "OFF" && !value.complianceApproved) {
            ctx.addIssue({
                code: "custom",
                path: ["complianceApproved"],
                message: "Compliance approval is required for a live pilot mode",
            });
        }
        if (value.pilotMode !== "OFF" && value.dailyAiRunLimit <= 0) {
            ctx.addIssue({
                code: "custom",
                path: ["dailyAiRunLimit"],
                message: "A positive daily AI run limit is required",
            });
        }
        if (value.pilotMode !== "OFF" && value.dailyAiCostDollars <= 0) {
            ctx.addIssue({
                code: "custom",
                path: ["dailyAiCostDollars"],
                message: "A positive daily AI cost limit is required",
            });
        }
    })
        .parse(Object.fromEntries(formData));
    await updateCreatorPilotPolicy(data.agencyId, {
        accountId: data.accountId,
        pilotMode: data.pilotMode,
        complianceApproved: data.complianceApproved,
        dailyAiRunLimit: data.dailyAiRunLimit,
        dailyAiCostLimitMicros: Math.round(data.dailyAiCostDollars * 1000000),
    }, admin.user.id);
    revalidatePath("/admin");
}
