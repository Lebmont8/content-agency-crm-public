const DEFAULT_PUBLIC_HOST = "app.example.invalid";
function firstHeaderValue(value: string | null): string {
    return value?.split(",", 1)[0]?.trim().toLowerCase() ?? "";
}
function normalizedHost(value: string | null): string {
    const host = firstHeaderValue(value);
    return host.startsWith("[")
        ? host.slice(0, host.indexOf("]") + 1)
        : host.split(":", 1)[0] ?? "";
}
export function configuredPublicHost(value: string | undefined): string {
    return normalizedHost(value || DEFAULT_PUBLIC_HOST) || DEFAULT_PUBLIC_HOST;
}
export function shouldRedirectToHttps(input: {
    nodeEnv: string | undefined;
    requestProtocol: string;
    forwardedProto: string | null;
    forwardedHost: string | null;
    host: string | null;
    publicHost?: string | undefined;
}): boolean {
    if (input.nodeEnv !== "production")
        return false;
    const publicHost = configuredPublicHost(input.publicHost);
    const requestHost = normalizedHost(input.forwardedHost || input.host);
    if (!publicHost || requestHost !== publicHost)
        return false;
    const forwardedProto = firstHeaderValue(input.forwardedProto);
    const protocol = forwardedProto || input.requestProtocol.toLowerCase();
    return protocol !== "https" && protocol !== "https:";
}
