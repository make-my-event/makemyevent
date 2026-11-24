// Public values only. Secrets never belong in the web app.
function required(name: string, value: string | undefined): string {
	if (!value) {
		throw new Error(
			`${name} is not set. Copy apps/web/.env.example to apps/web/.env.local and fill it in.`,
		);
	}
	return value;
}

export const env = {
	supabaseUrl: required(
		"NEXT_PUBLIC_SUPABASE_URL",
		process.env.NEXT_PUBLIC_SUPABASE_URL,
	),
	supabasePublishableKey: required(
		"NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
	),
	/** Where sign-in links and OAuth come back to. */
	appUrl: required(
		"NEXT_PUBLIC_APP_URL",
		process.env.NEXT_PUBLIC_APP_URL,
	).replace(/\/$/, ""),
};
