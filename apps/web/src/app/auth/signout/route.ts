import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Sign out. POST only, and only from this site's own pages. */
export async function POST(request: NextRequest) {
	const origin = request.headers.get("origin");
	if (!origin || origin !== request.nextUrl.origin) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const supabase = await createClient();
	await supabase.auth.signOut();

	return NextResponse.redirect(new URL("/signin", request.url), 303);
}
