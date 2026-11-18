export function sanitizeFanText(value: string, max = 2000): string { return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max); }
