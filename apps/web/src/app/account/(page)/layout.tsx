import { SiteHeader } from "@/components/site-header";

/** A signed-in person's own account. Like the dashboard, without the footer. */
export default function AccountLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<>
			<SiteHeader />
			{children}
		</>
	);
}
