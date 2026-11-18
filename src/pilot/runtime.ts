type RuntimeEnv = Readonly<Record<string, string | undefined>>;
export function isLivePilotRuntimeEnabled(_env?: RuntimeEnv): boolean {
    return false;
}
export type PilotRuntimeReadiness = {
    ready: boolean;
    blockers: string[];
};
export function evaluatePilotRuntimeReadiness(_env?: RuntimeEnv, _now?: Date): PilotRuntimeReadiness {
    return { ready: false, blockers: ["AUTOMATION_NOT_DISTRIBUTED"] };
}
export function isLivePilotRuntimeReady(_env?: RuntimeEnv, _now?: Date): boolean {
    return false;
}
export {};
