import "server-only";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { logAudit } from "@/domain/audit";
import { getAuth, type AuthContext } from "@/lib/session";
import { BILLING_PERIOD_DAYS, commissionCents, billingPeriodBounds, paymentState, type PaymentState } from "@/domain/commission";
import { settleConfirmedCryptoPayment } from "@/billing/settlement";
export async function requirePlatformAdmin(): Promise<AuthContext> {
    const auth = await getAuth();
    if (!auth)
        redirect("/login");
    if (!auth.user.isPlatformAdmin)
        redirect("/inbox");
    return auth;
}
export interface AdminAgencyRow {
    id: string;
    name: string;
    suspended: boolean;
    paymentState: PaymentState;
    dueDate: Date | null;
    userCount: number;
    activeModels: number;
    pendingModels: number;
    assistPercent: number;
    autoPercent: number;
    perModelFeeCents: number;
    aiSalesCents: number;
    totalDueCents: number;
    pilotEnabled: boolean;
    creatorAccounts: AdminCreatorPilotRow[];
}
export interface AdminCreatorPilotRow {
    id: string;
    displayName: string;
    platform: string;
    pilotMode: "OFF" | "SHADOW" | "ASSIST" | "AUTO";
    complianceApprovedAt: Date | null;
    dailyAiRunLimit: number;
    dailyAiCostLimitMicros: number;
    aiAutoReply: boolean;
}
export interface AdminDashboardSummary {
    agencies: number;
    owners: number;
    models: number;
    activeAi: number;
    paidAgencies: number;
    pendingAgencies: number;
    overdueAgencies: number;
    revenueCents: number;
    newAgencies: number;
    newModels: number;
    agencyGrowthPercent: number | null;
    modelGrowthPercent: number | null;
}
function growth(current: number, previous: number): number | null {
    if (previous === 0)
        return current === 0 ? 0 : null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
}
export async function getAdminDashboardSummary(): Promise<AdminDashboardSummary> {
    const now = new Date();
    const periodMs = BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000;
    const currentStart = new Date(now.getTime() - periodMs);
    const previousStart = new Date(currentStart.getTime() - periodMs);
    const [agencies, owners, models, activeAi, agencyRows, paidAgencyRows, revenue, newAgencies, previousAgencies, newModels, previousModels,] = await Promise.all([
        db.agency.count(),
        db.user.count({ where: { role: "OWNER", isActive: true } }),
        db.creatorAccount.count(),
        db.creatorAccount.count({
            where: {
                activated: true,
                status: "ACTIVE",
                pilotMode: { in: ["ASSIST", "AUTO"] },
                agency: { status: "ACTIVE" },
            },
        }),
        db.agency.findMany({
            select: { id: true, dueDate: true, paymentPending: true },
        }),
        db.billingRecord.findMany({
            where: { status: "PAID", paidAt: { gte: currentStart, lte: now } },
            distinct: ["agencyId"],
            select: { agencyId: true },
        }),
        db.billingRecord.aggregate({
            where: { status: "PAID", paidAt: { gte: currentStart, lte: now } },
            _sum: { amountCents: true },
        }),
        db.agency.count({ where: { createdAt: { gte: currentStart, lte: now } } }),
        db.agency.count({ where: { createdAt: { gte: previousStart, lt: currentStart } } }),
        db.creatorAccount.count({ where: { createdAt: { gte: currentStart, lte: now } } }),
        db.creatorAccount.count({ where: { createdAt: { gte: previousStart, lt: currentStart } } }),
    ]);
    const states = agencyRows.map((agency) => paymentState(agency.dueDate, agency.paymentPending, now));
    return {
        agencies,
        owners,
        models,
        activeAi,
        paidAgencies: paidAgencyRows.length,
        pendingAgencies: states.filter((state) => state === "pending_confirm").length,
        overdueAgencies: states.filter((state) => state === "overdue" || state === "blocked").length,
        revenueCents: revenue._sum.amountCents ?? 0,
        newAgencies,
        newModels,
        agencyGrowthPercent: growth(newAgencies, previousAgencies),
        modelGrowthPercent: growth(newModels, previousModels),
    };
}
export async function listAgenciesForAdmin(): Promise<AdminAgencyRow[]> {
    const agencies = await db.agency.findMany({
        orderBy: { createdAt: "asc" },
        include: {
            _count: { select: { users: true } },
            creatorAccounts: {
                orderBy: { displayName: "asc" },
                select: {
                    id: true,
                    displayName: true,
                    platform: true,
                    pilotMode: true,
                    complianceApprovedAt: true,
                    dailyAiRunLimit: true,
                    dailyAiCostLimitMicros: true,
                    aiAutoReply: true,
                },
            },
        },
    });
    const { start, end } = billingPeriodBounds(null);
    const [sales, models] = await Promise.all([
        db.transaction.groupBy({
            by: ["agencyId", "aiMode"],
            where: {
                aiMode: { in: ["ASSIST", "AUTO"] },
                occurredAt: { gte: start, lte: end },
            },
            _sum: { amountCents: true },
        }),
        db.creatorAccount.groupBy({
            by: ["agencyId", "activated"],
            _count: { _all: true },
        }),
    ]);
    const salesByAgency = new Map<string, {
        assist: number;
        auto: number;
    }>();
    for (const s of sales) {
        const e = salesByAgency.get(s.agencyId) ?? { assist: 0, auto: 0 };
        if (s.aiMode === "ASSIST")
            e.assist += s._sum.amountCents ?? 0;
        else
            e.auto += s._sum.amountCents ?? 0;
        salesByAgency.set(s.agencyId, e);
    }
    const modelsByAgency = new Map<string, {
        active: number;
        pending: number;
    }>();
    for (const m of models) {
        const e = modelsByAgency.get(m.agencyId) ?? { active: 0, pending: 0 };
        if (m.activated)
            e.active += m._count._all;
        else
            e.pending += m._count._all;
        modelsByAgency.set(m.agencyId, e);
    }
    return agencies.map((a) => {
        const s = salesByAgency.get(a.id) ?? { assist: 0, auto: 0 };
        const m = modelsByAgency.get(a.id) ?? { active: 0, pending: 0 };
        const commission = commissionCents(s.assist, a.commissionAssistPercent) +
            commissionCents(s.auto, a.commissionAutoPercent);
        return {
            id: a.id,
            name: a.name,
            suspended: a.status === "SUSPENDED",
            paymentState: paymentState(a.dueDate, a.paymentPending),
            dueDate: a.dueDate,
            userCount: a._count.users,
            activeModels: m.active,
            pendingModels: m.pending,
            assistPercent: a.commissionAssistPercent,
            autoPercent: a.commissionAutoPercent,
            perModelFeeCents: a.perModelFeeCents,
            aiSalesCents: s.assist + s.auto,
            totalDueCents: m.active * a.perModelFeeCents + commission,
            pilotEnabled: a.pilotEnabled,
            creatorAccounts: a.creatorAccounts,
        };
    });
}
async function stopPilotAutomation(agencyId: string, creatorAccountIds: string[], now: Date): Promise<void> {
    if (creatorAccountIds.length === 0)
        return;
    const conversations = await db.conversation.findMany({
        where: { agencyId, creatorAccountId: { in: creatorAccountIds } },
        select: { id: true },
    });
    const conversationIds = conversations.map((conversation) => conversation.id);
    await db.$transaction([
        db.creatorAccount.updateMany({
            where: { agencyId, id: { in: creatorAccountIds } },
            data: { aiAutoReply: false },
        }),
        db.conversation.updateMany({
            where: { agencyId, id: { in: conversationIds }, controlMode: "AUTO" },
            data: { controlMode: "HUMAN", nextActionAt: null },
        }),
        db.followUpJob.updateMany({
            where: {
                agencyId,
                creatorAccountId: { in: creatorAccountIds },
                status: { in: ["PENDING", "PROCESSING", "RETRY"] },
            },
            data: {
                status: "CANCELED",
                cancelReason: "PILOT_POLICY_CHANGED",
                canceledAt: now,
                leaseOwner: null,
                leaseUntil: null,
            },
        }),
        db.outboundDelivery.updateMany({
            where: {
                agencyId,
                creatorAccountId: { in: creatorAccountIds },
                status: { in: ["PENDING", "RETRY"] },
                message: {
                    OR: [{ originAgentActionId: { not: null } }, { aiMode: "AUTO" }],
                },
            },
            data: {
                status: "CANCELED",
                leaseOwner: null,
                leaseUntil: null,
                lastErrorCode: "PILOT_POLICY_CHANGED",
                lastErrorAt: now,
            },
        }),
        db.agentAction.updateMany({
            where: {
                agencyId,
                conversationId: { in: conversationIds },
                kind: { in: ["SEND_TEXT", "SEND_PPV", "SCHEDULE_FOLLOW_UP"] },
                status: { in: ["PROPOSED", "APPROVED", "EXECUTING"] },
            },
            data: {
                status: "CANCELED",
                reasonCode: "PILOT_POLICY_CHANGED",
                executedAt: now,
            },
        }),
    ]);
}
export async function setAgencyPilotEnabled(agencyId: string, enabled: boolean, actorId: string): Promise<void> {
    const before = await db.agency.findUnique({
        where: { id: agencyId },
        select: { pilotEnabled: true },
    });
    if (!before || before.pilotEnabled === enabled)
        return;
    await db.agency.update({
        where: { id: agencyId },
        data: { pilotEnabled: enabled },
    });
    if (!enabled) {
        const realAccounts = await db.creatorAccount.findMany({
            where: { agencyId, platform: { not: "mock" } },
            select: { id: true },
        });
        await stopPilotAutomation(agencyId, realAccounts.map((account) => account.id), new Date());
    }
    await logAudit(db, agencyId, {
        actorId,
        action: "agency.pilot.update",
        entityType: "Agency",
        entityId: agencyId,
        before: { pilotEnabled: before.pilotEnabled },
        after: { pilotEnabled: enabled },
    });
}
export async function updateCreatorPilotPolicy(agencyId: string, input: {
    accountId: string;
    pilotMode: "OFF" | "SHADOW" | "ASSIST" | "AUTO";
    complianceApproved: boolean;
    dailyAiRunLimit: number;
    dailyAiCostLimitMicros: number;
}, actorId: string): Promise<void> {
    const before = await db.creatorAccount.findFirst({
        where: { id: input.accountId, agencyId },
        select: {
            id: true,
            pilotMode: true,
            complianceApprovedAt: true,
            dailyAiRunLimit: true,
            dailyAiCostLimitMicros: true,
            aiAutoReply: true,
        },
    });
    if (!before)
        return;
    const complianceApprovedAt = input.complianceApproved
        ? before.complianceApprovedAt ?? new Date()
        : null;
    await db.creatorAccount.update({
        where: { id: before.id },
        data: {
            pilotMode: input.pilotMode,
            complianceApprovedAt,
            dailyAiRunLimit: input.dailyAiRunLimit,
            dailyAiCostLimitMicros: input.dailyAiCostLimitMicros,
            ...(input.pilotMode === "AUTO" ? {} : { aiAutoReply: false }),
        },
    });
    if ((before.pilotMode === "AUTO" && input.pilotMode !== "AUTO") ||
        input.pilotMode === "OFF") {
        await stopPilotAutomation(agencyId, [before.id], new Date());
    }
    await logAudit(db, agencyId, {
        actorId,
        action: "account.pilot.update",
        entityType: "CreatorAccount",
        entityId: before.id,
        before: {
            pilotMode: before.pilotMode,
            complianceApproved: before.complianceApprovedAt !== null,
            dailyAiRunLimit: before.dailyAiRunLimit,
            dailyAiCostLimitMicros: before.dailyAiCostLimitMicros,
            aiAutoReply: before.aiAutoReply,
        },
        after: {
            pilotMode: input.pilotMode,
            complianceApproved: complianceApprovedAt !== null,
            dailyAiRunLimit: input.dailyAiRunLimit,
            dailyAiCostLimitMicros: input.dailyAiCostLimitMicros,
            aiAutoReply: input.pilotMode === "AUTO" ? before.aiAutoReply : false,
        },
    });
}
export async function setAgencyStatus(agencyId: string, suspend: boolean, actorId: string): Promise<void> {
    await db.agency.update({
        where: { id: agencyId },
        data: { status: suspend ? "SUSPENDED" : "ACTIVE" },
    });
    await logAudit(db, agencyId, {
        actorId,
        action: "agency.status.update",
        entityType: "Agency",
        entityId: agencyId,
        after: { suspended: suspend },
    });
}
export async function updateAgencyPricing(agencyId: string, input: {
    assistPercent: number;
    autoPercent: number;
    perModelFeeCents: number;
}, actorId: string): Promise<void> {
    await db.agency.update({
        where: { id: agencyId },
        data: {
            commissionAssistPercent: input.assistPercent,
            commissionAutoPercent: input.autoPercent,
            perModelFeeCents: input.perModelFeeCents,
        },
    });
    await logAudit(db, agencyId, {
        actorId,
        action: "agency.pricing.update",
        entityType: "Agency",
        entityId: agencyId,
        after: input,
    });
}
export async function confirmPayment(agencyId: string, actorId: string): Promise<void> {
    const payment = await db.cryptoPayment.findFirst({
        where: { agencyId, status: { in: ["SUBMITTED", "VERIFYING"] } },
        orderBy: { submittedAt: "desc" },
        select: { id: true, requiredConfirmations: true },
    });
    if (!payment)
        throw new Error("NO_SUBMITTED_PAYMENT");
    await settleConfirmedCryptoPayment({
        agencyId,
        paymentId: payment.id,
        confirmations: payment.requiredConfirmations,
        actorId,
    });
}
