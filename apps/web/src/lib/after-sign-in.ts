import type { User } from "@supabase/supabase-js";
import { verifiedTotp } from "./two-step";

/**
 * Where a sign-in goes next: to enter a code, for someone with an
 * authenticator, and on to `next` after it. Only saves a detour. Every page
 * that needs a code asks for it itself (requireUser).
 */
export function afterSignIn(next: string, user: User | null): string {
	return verifiedTotp(user?.factors).length > 0
		? `/signin/verify?${new URLSearchParams({ next })}`
		: next;
}
