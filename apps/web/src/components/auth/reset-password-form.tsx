"use client";

import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { JSX } from "react";

const inputClass =
	"w-full bg-paper border border-perforation rounded-md px-4 py-4 text-body focus:outline-none focus:border-stamp focus:ring-1 focus:ring-stamp";

/** Sets a new password from an emailed reset link. */
export function ResetPasswordForm(): JSX.Element {
	const token = useSearchParams().get("token") ?? "";
	const router = useRouter();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);

	const reset = trpc.account.resetPassword.useMutation({
		onSuccess: () => router.push("/login?reset=1"),
		onError: (err) => setError(err.message),
	});

	if (!token) {
		return (
			<div className="w-full max-w-sm mx-auto text-center space-y-4">
				<h1 className="font-display font-semibold text-h2">
					Choose a new password
				</h1>
				<p className="text-body opacity-80">
					This link is incomplete.{" "}
					<Link href="/forgot-password" className="underline">
						Request a new reset link
					</Link>
					.
				</p>
			</div>
		);
	}

	return (
		<div className="w-full max-w-sm mx-auto">
			<div className="text-center mb-8">
				<h1 className="font-display font-semibold text-h2 mb-2">
					Choose a new password
				</h1>
				<p className="text-body opacity-80">
					At least 8 characters. You'll be signed out on other devices.
				</p>
			</div>
			<form
				className="space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					setError(null);
					if (password !== confirm) {
						setError("The passwords don't match.");
						return;
					}
					reset.mutate({ token, newPassword: password });
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
					<label htmlFor="new-password" className="block label mb-2">
						New password
					</label>
					<input
						id="new-password"
						type="password"
						required
						minLength={8}
						autoComplete="new-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className={inputClass}
					/>
				</div>
				<div>
					<label htmlFor="confirm-password" className="block label mb-2">
						Confirm new password
					</label>
					<input
						id="confirm-password"
						type="password"
						required
						minLength={8}
						autoComplete="new-password"
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
						className={inputClass}
					/>
				</div>
				<button
					type="submit"
					disabled={reset.isPending}
					className="w-full bg-stamp text-paper label p-4 rounded-md hover:opacity-90 transition-opacity disabled:opacity-70"
				>
					{reset.isPending ? "Saving..." : "Set new password"}
				</button>
			</form>
		</div>
	);
}
