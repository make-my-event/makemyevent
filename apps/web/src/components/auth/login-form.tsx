"use client";

import { registerUser } from "@/app/actions/auth";
import { getClientDeviceId } from "@/lib/device";
import { safeCallbackUrl } from "@/lib/safe-callback-url";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import type { JSX } from "react";

export function LoginForm(): JSX.Element {
	const searchParams = useSearchParams();
	const urlError = searchParams.get("error");

	const [isLogin, setIsLogin] = useState<boolean>(true);
	const [name, setName] = useState<string>("");
	const [email, setEmail] = useState<string>("");
	const [password, setPassword] = useState<string>("");
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [showResend, setShowResend] = useState<boolean>(false);

	const resendVerification = trpc.account.resendVerification.useMutation({
		onSuccess: (res) => {
			setShowResend(false);
			setError(null);
			setNotice(res.message);
		},
		onError: (err) => setError(err.message),
	});

	// Ensure persistent device ID is initialized in cookies & localStorage
	useEffect(() => {
		getClientDeviceId();
	}, []);

	useEffect(() => {
		if (searchParams.get("verified") === "1") {
			setNotice("Email verified. You can sign in now.");
		} else if (searchParams.get("reset") === "1") {
			setNotice(
				"Password updated. Sign in with your new password. You were signed out on other devices.",
			);
		}
	}, [searchParams]);

	useEffect(() => {
		if (urlError === "AccessDenied") {
			setError(
				"We couldn't confirm your email with that provider. Make sure the email on your Google or GitHub account is verified, then try again.",
			);
		} else if (urlError === "OAuthAccountNotLinked") {
			setError(
				"An account with this email already exists under another sign-in method. Email account linking is now enabled — please click Sign In with GitHub again to link your accounts.",
			);
		} else if (urlError === "Configuration") {
			setError(
				"Authentication configuration error. Please check server settings.",
			);
		} else if (urlError) {
			setError("Authentication error occurred. Please try again.");
		}
	}, [urlError]);

	// Attacker-controlled query parameter: only same-site paths are allowed.
	const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);

		const normalizedEmail = email.trim().toLowerCase();

		try {
			if (isLogin) {
				const res = await signIn("credentials", {
					email: normalizedEmail,
					password,
					redirect: false,
				});

				if (res?.error) {
					if (res.code === "rate_limited") {
						setError(
							"Too many sign-in attempts. Please wait 15 minutes and try again.",
						);
					} else if (res.code === "email_unverified") {
						setError(
							"Verify your email before signing in. Check your inbox for the link we sent.",
						);
						setShowResend(true);
					} else {
						setError("Invalid email or password");
					}
					setIsLoading(false);
				} else {
					window.location.href = callbackUrl;
				}
			} else {
				const formData = new FormData();
				if (name.trim()) {
					formData.append("name", name.trim());
				}
				formData.append("email", normalizedEmail);
				formData.append("password", password);

				const result = await registerUser(formData);
				if (result.error) {
					setError(result.error);
				} else {
					// New accounts verify their email before signing in, so there is
					// no automatic sign-in here. The message is the same whether or
					// not the email was already registered.
					setNotice(result.message ?? null);
					setPassword("");
					setIsLogin(true);
				}
				setIsLoading(false);
			}
		} catch {
			setError("Something went wrong. Please try again.");
			setIsLoading(false);
		}
	};

	const handleOAuthLogin = (provider: string) => {
		signIn(provider, { callbackUrl });
	};

	return (
		<div className="mx-auto flex w-full max-w-sm flex-col gap-8">
			<div className="flex flex-col gap-2 text-center">
				<h1 className="text-balance font-display text-h2 font-semibold">
					{isLogin ? "Welcome back" : "Create an account"}
				</h1>
				<p className="text-pretty text-body text-ink/70">
					{isLogin
						? "Sign in to your makemyevent account"
						: "Sign up to start organizing and attending"}
				</p>
			</div>

			<div className="flex flex-col gap-4">
				<button
					type="button"
					onClick={() => handleOAuthLogin("github")}
					className="flex h-11 w-full items-center justify-center gap-4 rounded-md border border-ink/50 bg-paper px-4 text-ink transition-colors duration-150 hover:border-ink hover:bg-perforation/20 active:bg-perforation/40"
				>
					<svg
						aria-hidden="true"
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
						<path d="M9 18c-4.51 2-5-2-7-2" />
					</svg>
					<span className="label">Continue with GitHub</span>
				</button>

				<button
					type="button"
					onClick={() => handleOAuthLogin("google")}
					className="flex h-11 w-full items-center justify-center gap-4 rounded-md border border-ink/50 bg-paper px-4 text-ink transition-colors duration-150 hover:border-ink hover:bg-perforation/20 active:bg-perforation/40"
				>
					<svg
						aria-hidden="true"
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<circle cx="12" cy="12" r="10" />
						<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
						<path d="M2 12h20" />
					</svg>
					<span className="label">Continue with Google</span>
				</button>
			</div>

			<div className="relative text-center">
				<div className="absolute inset-0 flex items-center" aria-hidden="true">
					<div className="w-full border-t border-perforation" />
				</div>
				<div className="relative flex justify-center">
					<span className="label bg-paper px-4 text-ink/70">Or</span>
				</div>
			</div>

			<form onSubmit={handleSubmit} className="flex flex-col gap-4">
				{notice && (
					<div
						role="status"
						className="p-4 mb-4 text-sm text-ink bg-stamp/10 border border-stamp/30 rounded-md text-center"
					>
						{notice}
					</div>
				)}
				{error && (
					<div
						role="alert"
						className="rounded-md border border-alert/20 bg-alert/10 p-4 text-center text-sm text-alert"
					>
						{error}
						{showResend && (
							<button
								type="button"
								disabled={resendVerification.isPending}
								onClick={() =>
									resendVerification.mutate({
										email: email.trim().toLowerCase(),
									})
								}
								className="block mx-auto mt-2 underline text-ink disabled:opacity-50"
							>
								{resendVerification.isPending
									? "Sending..."
									: "Resend verification email"}
							</button>
						)}
					</div>
				)}
				{!isLogin && (
					<div className="flex flex-col gap-2">
						<label htmlFor="name" className="label">
							Full name
						</label>
						<input
							id="name"
							name="name"
							type="text"
							autoComplete="name"
							required
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Your name"
							className="h-11 w-full rounded-md border border-ink/50 bg-paper px-4 text-base text-ink placeholder:text-ink/50 transition-colors duration-150 focus-visible:border-stamp"
						/>
					</div>
				)}
				<div className="flex flex-col gap-2">
					<label htmlFor="email" className="label">
						Email address
					</label>
					<input
						id="email"
						name="email"
						type="email"
						autoComplete="email"
						spellCheck={false}
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="you@example.com"
						className="h-11 w-full rounded-md border border-ink/50 bg-paper px-4 text-base text-ink placeholder:text-ink/50 transition-colors duration-150 focus-visible:border-stamp"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="password" className="label">
						Password
					</label>
					<input
						id="password"
						name="password"
						type="password"
						autoComplete={isLogin ? "current-password" : "new-password"}
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder="••••••••"
						className="h-11 w-full rounded-md border border-ink/50 bg-paper px-4 text-base text-ink placeholder:text-ink/50 transition-colors duration-150 focus-visible:border-stamp"
					/>
					{isLogin && (
						<Link
							href="/forgot-password"
							className="inline-block mt-2 text-sm underline hover:text-stamp"
						>
							Forgot password?
						</Link>
					)}
				</div>
				<button
					type="submit"
					disabled={isLoading}
					aria-busy={isLoading}
					className="label inline-flex h-11 w-full items-center justify-center rounded-md bg-stamp px-4 text-paper transition-opacity duration-150 hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-70"
				>
					{isLoading ? "Please wait…" : isLogin ? "Sign In" : "Sign Up"}
				</button>
			</form>

			<div className="flex flex-col items-center gap-4 text-center">
				<button
					type="button"
					onClick={() => {
						setIsLogin(!isLogin);
						setError(null);
						setNotice(null);
						setShowResend(false);
					}}
					className="inline-flex min-h-11 items-center text-sm text-ink underline transition-colors duration-150 hover:text-stamp"
				>
					{isLogin
						? "Don’t have an account? Sign up"
						: "Already have an account? Sign in"}
				</button>
			</div>
		</div>
	);
}
