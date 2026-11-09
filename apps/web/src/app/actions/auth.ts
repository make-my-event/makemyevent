"use server";

import { clientIpFromHeaders } from "@/../../api/src/lib/client-ip";
import { RATE_LIMITS, consumeRateLimit } from "@/../../api/src/lib/rate-limit";
import bcrypt from "bcryptjs";
import { prisma } from "db";
import { headers } from "next/headers";

export type RegisterResult = {
	success?: boolean;
	error?: string;
};

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

	const ip = clientIpFromHeaders(await headers()) ?? "unknown";
	const limit = await consumeRateLimit(prisma, RATE_LIMITS.registerIp, ip);
	if (!limit.allowed) {
		return {
			error:
				"Too many sign-up attempts from this network. Please try again later.",
		};
	}

	const name =
		typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;
	const email = rawEmail.trim().toLowerCase();
	const password = rawPassword;

	try {
		const existingUser = await prisma.user.findUnique({
			where: { email },
			select: { id: true },
		});

		if (existingUser) {
			return { error: "User already exists with this email" };
		}

		const passwordHash = await bcrypt.hash(password, 12);

		await prisma.user.create({
			data: {
				name,
				email,
				passwordHash,
			},
		});

		return { success: true };
	} catch (error) {
		console.error("Registration error:", error);
		return { error: "Something went wrong during registration" };
	}
}
