import { defineConfig, env } from "prisma/config";

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		// Migrations run over the direct connection, never the pooler: a
		// transaction pooler cannot hold the advisory locks migrations need.
		url: env("DIRECT_URL"),
	},
});
