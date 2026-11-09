"use client";

import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { useState } from "react";
import type { JSX } from "react";

/** Requests a password reset link. The answer never reveals whether the email has an account. */
export function ForgotPasswordForm(): JSX.Element {
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const request = trpc.account.requestPasswordReset.useMutation({
		onSuccess: (res) => setMessage(res.message),
		onError: (err) => setError(err.message),
	});

	return (
		<div className="w-full max-w-sm mx-auto">
			<div className="text-center mb-8">
				<h1 className="font-display font-semibold text-h2 mb-2">
					Reset your password
				</h1>
				<p className="text-body opacity-80">
					We'll email you a link to choose a new password.
				</p>
			</div>
			{message ? (
				<div
					role="status"
					className="p-4 text-sm text-ink bg-stamp/10 border border-stamp/30 rounded-md text-center"
				>
					{message}
				</div>
			) : (
				<form
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						setError(null);
						request.mutate({ email: email.trim().toLowerCase() });
					}}
				>
					{error && (
						<div
							role="alert"
							className="p-4 text-sm text-alert bg-alert/10 border border-alert/20 rounded-md text-center"
						>
							{error}
						</div>
					)}
					<div>
						<label htmlFor="reset-email" className="block label mb-2">
							Email address
						</label>
						<input
							id="reset-email"
							type="email"
							required
							autoComplete="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@example.com"
							className="w-full bg-paper border border-perforation rounded-md px-4 py-4 text-body focus:outline-none focus:border-stamp focus:ring-1 focus:ring-stamp"
						/>
					</div>
					<button
						type="submit"
						disabled={request.isPending}
						className="w-full bg-stamp text-paper label p-4 rounded-md hover:opacity-90 transition-opacity disabled:opacity-70"
					>
						{request.isPending ? "Sending..." : "Send reset link"}
					</button>
				</form>
			)}
			<p className="mt-6 text-center text-sm">
				<Link href="/login" className="underline hover:text-stamp">
					Back to sign in
				</Link>
			</p>
		</div>
	);
}
