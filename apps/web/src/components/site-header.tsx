import { getDisplayName } from "@/lib/supabase/identity";
import { HeaderNav } from "./header-nav";

/**
 * Site chrome. The name comes from the header the middleware set, which it
 * filled in from a session it had already verified, so rendering this costs
 * no further call to Supabase. That matters here: this header sits on the
 * public pages, where traffic arrives in bursts.
 *
 * `wide` matches the band to the dashboard's wider content, so its edges line
 * up with the toolbar beneath it.
 */
export async function SiteHeader({ wide = false }: { wide?: boolean }) {
	return <HeaderNav signedInAs={await getDisplayName()} wide={wide} />;
}
