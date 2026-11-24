import { getDisplayName } from "@/lib/supabase/identity";
import { CreateEventButton } from "../dashboard/create-event-dialog";

/**
 * The landing page's "Create an event". Signed in, it opens the same Create
 * Event popup as the dashboard, right here. Signed out, it is a link that
 * signs them in and then opens Create Event (/events/new).
 *
 * The name comes from the middleware's header, for show only: the popup
 * names the personal host with it. Creating checks the session itself, so
 * a stale name can open the popup but never create anything. A signed-out
 * visitor gets a plain link and loads none of the popup's code.
 */
export async function CreateCta({
	label,
	className,
}: {
	label: string;
	className: string;
}) {
	const name = await getDisplayName();
	if (!name)
		return (
			<a className={className} href="/events/new">
				{label}
			</a>
		);
	return (
		<CreateEventButton
			workspaces={[{ id: "me", name, href: "/dashboard", personal: true }]}
			activeWorkspaceId="me"
			label={label}
			className={className}
			icon={false}
		/>
	);
}
