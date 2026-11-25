// A new password for app_login, the app's database login:
//
//   node packages/db/scripts/login-password.mjs
//
// Prints the password, for DATABASE_URL, and the statement that sets it, for
// the Supabase SQL editor. The statement carries only a SCRAM hash, because
// Supabase writes every ALTER ROLE to its logs as it was typed.
// Nothing is saved and nothing is sent anywhere.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

// 256 bits, in letters, digits, - and _: safe in a connection string.
const password = randomBytes(32).toString("base64url");

const ITERATIONS = 4096;
const salt = randomBytes(16);
const salted = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const hmac = (text) => createHmac("sha256", salted).update(text).digest();
const stored = createHash("sha256").update(hmac("Client Key")).digest("base64");
const server = hmac("Server Key").toString("base64");

console.log(`Password, for DATABASE_URL:

${password}

For the SQL editor:

ALTER ROLE app_login PASSWORD 'SCRAM-SHA-256$${ITERATIONS}:${salt.toString("base64")}$${stored}:${server}';
`);
