import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import type { JSX } from "react";

export default function Page(): JSX.Element {
	return (
		<AuthPageShell>
			<VerifyEmailForm />
		</AuthPageShell>
	);
}
