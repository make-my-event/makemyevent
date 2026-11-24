import { defineConfig } from "prisma/config";

// Only commands that connect (migrate, studio) need the database address;
// generating the client doesn't, and runs on every install, where there may
// be none (a fresh clone, the quality job, a Vercel build). Without it, a
// connecting command stops with Prisma's own "no datasource URL" error.
const directUrl = process.env.DIRECT_URL;

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
	},
	// Migrations run over the direct connection, never the pooler: a
	// transaction pooler cannot hold the advisory locks migrations need.
	...(directUrl ? { datasource: { url: directUrl } } : {}),
});
