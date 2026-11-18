import "server-only";
export function isPublicRegistrationEnabled(value = process.env.PUBLIC_REGISTRATION_ENABLED): boolean {
    return value?.trim().toLowerCase() === "true";
}
