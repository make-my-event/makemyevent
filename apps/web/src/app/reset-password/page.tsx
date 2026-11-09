import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import type { JSX } from "react";

export default function Page(): JSX.Element {
	return (
		<AuthPageShell>
			<ResetPasswordForm />
		</AuthPageShell>
	);
}
