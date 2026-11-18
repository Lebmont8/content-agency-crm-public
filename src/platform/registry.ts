import type { PlatformAdapter } from "@/platform/adapter";
import { mockAdapter } from "@/platform/mock/mock-adapter";
import { fanvueAdapter } from "@/platform/fanvue/fanvue-adapter";
export type PlatformAuthMethodName = "MOCK" | "TELEGRAM_BOT" | "FANVUE_OAUTH" | "FANSLY_MANAGEMENT_SESSION" | "ONLYFANS_DESKTOP_SESSION";
export type ConnectionStatusName = "DRAFT" | "AUTHORIZING" | "VERIFYING" | "SYNCING" | "ACTIVE" | "REAUTH_REQUIRED" | "REVOKED" | "ERROR";
export type PlatformDefinition = Readonly<{
    authMethod: PlatformAuthMethodName;
    connectorImplemented: boolean;
    transport: "adapter" | "desktop";
    supportedCapabilities: readonly PlatformCapabilityName[];
}>;
export type PlatformCapabilityName = "sync" | "send_text" | "send_ppv" | "auto_reply";
export type PlatformCapabilities = Readonly<{
    connectorAvailable: boolean;
    canSync: boolean;
    canSendText: boolean;
    canSendPpv: boolean;
    canAutoReply: boolean;
}>;
const DISABLED_CAPABILITIES: PlatformCapabilities = {
    connectorAvailable: false,
    canSync: false,
    canSendText: false,
    canSendPpv: false,
    canAutoReply: false,
};
const definitions = new Map<string, PlatformDefinition>([
    [
        "mock",
        {
            authMethod: "MOCK",
            connectorImplemented: true,
            transport: "adapter",
            supportedCapabilities: ["sync", "send_text", "send_ppv", "auto_reply"],
        },
    ],
    [
        "telegram",
        {
            authMethod: "TELEGRAM_BOT",
            connectorImplemented: false,
            transport: "adapter",
            supportedCapabilities: [],
        },
    ],
    [
        "fanvue",
        {
            authMethod: "FANVUE_OAUTH",
            connectorImplemented: true,
            transport: "adapter",
            supportedCapabilities: ["sync", "send_text", "send_ppv"],
        },
    ],
    [
        "fansly",
        {
            authMethod: "FANSLY_MANAGEMENT_SESSION",
            connectorImplemented: true,
            transport: "desktop",
            supportedCapabilities: ["sync", "send_text", "auto_reply"],
        },
    ],
    [
        "onlyfans",
        {
            authMethod: "ONLYFANS_DESKTOP_SESSION",
            connectorImplemented: false,
            transport: "desktop",
            supportedCapabilities: [],
        },
    ],
]);
const adapters = new Map<string, PlatformAdapter>([
    ["mock", mockAdapter],
    ["fanvue", fanvueAdapter],
]);
export function getPlatformDefinition(platform: string): PlatformDefinition | null {
    return definitions.get(platform) ?? null;
}
export function getPlatformCapabilities(platform: string, connectionStatus?: string | null, grantedCapabilities: readonly string[] = []): PlatformCapabilities {
    const definition = definitions.get(platform);
    if (!definition ||
        !definition.connectorImplemented ||
        (definition.transport === "adapter" && !adapters.has(platform)) ||
        connectionStatus !== "ACTIVE") {
        return DISABLED_CAPABILITIES;
    }
    const granted = new Set(grantedCapabilities);
    const supports = (capability: PlatformCapabilityName) => definition.supportedCapabilities.includes(capability) &&
        granted.has(capability);
    return {
        connectorAvailable: true,
        canSync: supports("sync"),
        canSendText: supports("send_text"),
        canSendPpv: supports("send_ppv"),
        canAutoReply: supports("auto_reply"),
    };
}
export function getAdapter(platform: string): PlatformAdapter {
    const adapter = adapters.get(platform);
    if (!adapter) {
        throw new Error(`No connector installed for platform "${platform}". ` +
            `Real platform connectors are external modules that implement ` +
            `PlatformAdapter and register via registerAdapter().`);
    }
    return adapter;
}
export function hasAdapter(platform: string): boolean {
    return adapters.has(platform);
}
export function registerAdapter(adapter: PlatformAdapter, supportedCapabilities: readonly PlatformCapabilityName[]): void {
    const definition = definitions.get(adapter.platform);
    if (!definition) {
        throw new Error(`Unsupported platform "${adapter.platform}"`);
    }
    adapters.set(adapter.platform, adapter);
    definitions.set(adapter.platform, {
        ...definition,
        connectorImplemented: true,
        supportedCapabilities: [...supportedCapabilities],
    });
}
