import { SalesStage } from "@prisma/client";
export const SALES_STAGES = Object.values(SalesStage);
export type SalesStageName = SalesStage;
export class InvalidSalesStageTransitionError extends Error {
    readonly code = "AUTOMATION_NOT_DISTRIBUTED";
    constructor(..._args: unknown[]) { super("AUTOMATION_NOT_DISTRIBUTED"); }
}
export class SalesStageConflictError extends Error {
    readonly code = "AUTOMATION_NOT_DISTRIBUTED";
    constructor(..._args: unknown[]) { super("AUTOMATION_NOT_DISTRIBUTED"); }
}
export function canTransitionSalesStage(from: SalesStageName, to: SalesStageName): boolean { return from === to; }
export async function transitionSalesStage(..._args: unknown[]): Promise<never> { throw new Error("AUTOMATION_NOT_DISTRIBUTED"); }
