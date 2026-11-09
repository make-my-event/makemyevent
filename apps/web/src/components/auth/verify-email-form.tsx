"use client";

import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { JSX } from "react";

const inputClass =
	"w-full bg-paper border border-perforation rounded-md px-4 py-4 text-body focus:outline-none focus:border-stamp focus:ring-1 focus:ring-stamp";

/**
 * Completes email verification. Asks for the account's password so that a
 * verification link for an account someone else created with this address
 * cannot activate their password.
 */
export function VerifyEmailForm(): JSX.Element {
	const token = useSearchParams().get("token") ?? "";
	const router = useRouter();
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);

	const verify = trpc.account.verifyEmail.useMutation({
		onSuccess: () => router.push("/login?verified=1"),
		onError: (err) => setError(err.message),
	});

	if (!token) {
		return (
			<div className="w-full max-w-sm mx-auto text-center space-y-4">
				<h1 className="font-display font-semibold text-h2">
					Verify your email
				</h1>
				<p className="text-body opacity-80">
					This link is incomplete. Open the link from your verification email
					again.
				</p>
			</div>
		);
	}

	return (
		<div className="w-full max-w-sm mx-auto">
			<div className="text-center mb-8">
				<h1 className="font-display font-semibold text-h2 mb-2">
					Verify your email
				</h1>
				<p className="text-body opacity-80">
					Enter the password you chose when you created your account.
				</p>
			</div>
			<form
				className="space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					setError(null);
					verify.mutate({ token, password });
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
					<label htmlFor="verify-password" className="block label mb-2">
						Password
					</label>
					<input
						id="verify-password"
						type="password"
						required
						autoComplete="current-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className={inputClass}
					/>
				</div>
				<button
					type="submit"
					disabled={verify.isPending}
					className="w-full bg-stamp text-paper label p-4 rounded-md hover:opacity-90 transition-opacity disabled:opacity-70"
				>
					{verify.isPending ? "Verifying..." : "Verify email"}
				</button>
			</form>
			<p className="mt-6 text-center text-sm">
				Didn't create this account?{" "}
				<Link href="/forgot-password" className="underline hover:text-stamp">
					Reset the password
				</Link>{" "}
				to take it over.
			</p>
		</div>
	);
}
