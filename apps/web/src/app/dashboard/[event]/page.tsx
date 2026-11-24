import { redirect } from "next/navigation";

type Props = { params: Promise<{ event: string }> };

/** /dashboard/{event} on its own opens the first section. */
export default async function EventIndexPage({ params }: Props) {
	const { event } = await params;
	redirect(`/dashboard/${encodeURIComponent(event)}/overview`);
}
