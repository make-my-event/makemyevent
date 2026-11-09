import * as path from "node:path";
import { NestFactory } from "@nestjs/core";
import * as trpcExpress from "@trpc/server/adapters/express";
import { config } from "dotenv";

// Load root workspace .env file
config({ path: path.resolve(__dirname, "../../../.env") });

import { AppModule } from "./app.module";
import { appRouter } from "./trpc/app.router";
import { createContext } from "./trpc/trpc";

/**
 * Browser origins allowed to call this API (comma-separated
 * ALLOWED_ORIGINS, e.g. "https://makemyevent.org"). An open CORS policy on an
 * API is a vulnerability (docs/security.md), so production refuses to start
 * without an explicit list.
 */
function allowedOrigins(): string[] {
	const configured = (process.env.ALLOWED_ORIGINS ?? "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
	if (configured.length > 0) return configured;
	if (process.env.NODE_ENV === "production") {
		throw new Error(
			"ALLOWED_ORIGINS must be set in production (comma-separated list of allowed browser origins).",
		);
	}
	return ["http://localhost:3000"];
}

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	// This server has no sign-in of its own (the context below carries no
	// user), so credentials are not allowed cross-origin.
	app.enableCors({ origin: allowedOrigins(), credentials: false });
	app.use(
		"/trpc",
		trpcExpress.createExpressMiddleware({
			router: appRouter,
			// The socket address cannot be spoofed with headers. Behind a proxy,
			// configure Express "trust proxy" deliberately before using req.ip.
			createContext: ({ req }) =>
				createContext(null, null, null, req.socket.remoteAddress ?? null),
		}),
	);
	await app.listen(3001);
}
bootstrap();
