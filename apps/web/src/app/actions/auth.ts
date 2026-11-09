"use server";

import { clientIpFromHeaders } from "@/../../api/src/lib/client-ip";
import { RATE_LIMITS, consumeRateLimit } from "@/../../api/src/lib/rate-limit";
import {
	GENERIC_SIGNUP_MESSAGE,
	passwordProblem,
	registerAccount,
} from "@/../../api/src/services/accounts";
import { createContext } from "@/../../api/src/trpc/trpc";
import { TRPCError } from "@trpc/server";
import { headers } from "next/headers";

export type RegisterResult = {
	success?: boolean;
	/** Shown to the user on success (the same text whether or not the email was new). */
	message?: string;
	error?: string;
};

/**
 * Password sign-up. The account rules (verification email, no disclosure of
 * whether the email is registered) live in apps/api/src/services/accounts.ts.
 */
export async function registerUser(
	formData: FormData,
): Promise<RegisterResult> {
	const rawName = formData.get("name");
	const rawEmail = formData.get("email");
	const rawPassword = formData.get("password");

	if (
		typeof rawEmail !== "string" ||
		typeof rawPassword !== "string" ||
		!rawEmail.trim() ||
		!rawPassword
	) {
		return { error: "Email and password are required" };
	}

	const problem = passwordProblem(rawPassword);
	if (problem) return { error: problem };

	const { prisma } = createContext();
	const ip = clientIpFromHeaders(await headers());
	const limit = await consumeRateLimit(
		prisma,
		RATE_LIMITS.registerIp,
		ip ?? "unknown",
	);
	if (!limit.allowed) {
		return {
			error:
				"Too many sign-up attempts from this network. Please try again later.",
		};
	}

	const name =
		typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;

	try {
		await registerAccount(
			prisma,
			{ name, email: rawEmail, password: rawPassword },
			ip,
		);
		return { success: true, message: GENERIC_SIGNUP_MESSAGE };
	} catch (error) {
		// Validation problems (e.g. a breached password) are safe to show.
		if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
			return { error: error.message };
		}
		console.error("[auth] Registration error:", error);
		return { error: "Something went wrong during registration" };
	}
}
