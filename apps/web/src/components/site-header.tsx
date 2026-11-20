import { getDisplayName } from "@/lib/supabase/identity";
import { HeaderNav } from "./header-nav";

/**
 * Site chrome. The name comes from the header the middleware set, which it
 * filled in from a session it had already verified, so rendering this costs
 * no further call to Supabase. That matters here: this header sits on the
 * public pages, where traffic arrives in bursts.
 */
export async function SiteHeader() {
	return <HeaderNav signedInAs={await getDisplayName()} />;
}
