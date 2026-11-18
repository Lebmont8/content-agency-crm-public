import { type NextRequest, NextResponse } from "next/server";
import { configuredPublicHost, shouldRedirectToHttps } from "@/lib/https-redirect";
export function middleware(request: NextRequest) {
    if (shouldRedirectToHttps({
        nodeEnv: process.env.NODE_ENV,
        requestProtocol: request.nextUrl.protocol,
        forwardedProto: request.headers.get("x-forwarded-proto"),
        forwardedHost: request.headers.get("x-forwarded-host"),
        host: request.headers.get("host"),
        publicHost: process.env.PUBLIC_APP_HOST,
    })) {
        const target = request.nextUrl.clone();
        target.protocol = "https:";
        target.hostname = configuredPublicHost(process.env.PUBLIC_APP_HOST);
        target.port = "";
        return NextResponse.redirect(target, 308);
    }
    return NextResponse.next();
}
export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
