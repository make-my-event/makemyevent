import assert from "node:assert/strict";
import { test } from "node:test";
import { poolOptions, SUPABASE_ROOT_CA } from "./tls.ts";

const POOLER =
	"postgresql://user:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";

test("Supabase is always encrypted and verified against its root", () => {
	for (const url of [
		`${POOLER}?sslmode=require`,
		POOLER,
		`${POOLER}?sslmode=disable&pgbouncer=true`,
		"postgresql://u:p@db.abcd.supabase.co:5432/postgres?sslmode=no-verify",
	]) {
		const options = poolOptions(url);
		assert.deepEqual(options.ssl, {
			ca: SUPABASE_ROOT_CA,
			rejectUnauthorized: true,
		});
		// The string's own sslmode would replace the ssl options: it's gone,
		// and everything else in the string is kept.
		assert.equal(
			new URL(options.connectionString).searchParams.has("sslmode"),
			false,
		);
	}
	assert.equal(
		new URL(
			poolOptions(`${POOLER}?sslmode=disable&pgbouncer=true`).connectionString,
		).searchParams.get("pgbouncer"),
		"true",
	);
	assert.match(
		SUPABASE_ROOT_CA,
		/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/,
	);
});

test("another host is verified with the system's roots when it asks for TLS", () => {
	assert.deepEqual(
		poolOptions("postgresql://u:p@db.example.com/app?sslmode=require").ssl,
		{ rejectUnauthorized: true },
	);
});

test("a local database is left as written", () => {
	const url = "postgresql://postgres:postgres@localhost:5434/makemyevent";
	assert.deepEqual(poolOptions(url), { connectionString: url });
});
