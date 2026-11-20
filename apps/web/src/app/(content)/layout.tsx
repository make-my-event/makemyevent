import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/** Shared chrome for the pages that are mostly words. */
export default function ContentLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<>
			<SiteHeader />
			{children}
			<SiteFooter />
		</>
	);
}
