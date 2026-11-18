import { isPublicRegistrationEnabled } from "@/lib/public-registration";
import { RegisterPageContent } from "./register-page-content";
export default function RegisterPage() {
    return <RegisterPageContent enabled={isPublicRegistrationEnabled()}/>;
}
