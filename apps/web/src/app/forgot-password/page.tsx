import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import type { JSX } from "react";

export default function Page(): JSX.Element {
	return (
		<AuthPageShell>
			<ForgotPasswordForm />
		</AuthPageShell>
	);
}
