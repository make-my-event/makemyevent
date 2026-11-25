import { SiteHeader } from "@/components/site-header";
import EventPageLoading from "./[event]/edit/loading";
import FormBuilderLoading from "./[event]/form-builder/loading";
import GuestsLoading from "./[event]/guests/loading";
import { EventHeaderSkeleton } from "./[event]/event-header";
import SectionLoading from "./[event]/[section]/loading";
import OverviewLoading from "./[event]/overview/loading";
import OrganizedLoading from "./(lists)/(organized)/loading";
import AttendingLoading from "./(lists)/attending/(list)/loading";
import { PendingNavProvider, PendingSlot } from "./pending-nav";
import { ToolbarSkeleton } from "./toolbar-skeleton";

/**
 * Everything under /dashboard: the site band, then either the event lists
 * (the (lists) group, with its toolbar) or one event's dashboard
 * (/dashboard/{event}/…, with its sidebar).
 *
 * Every move inside it answers the press at once (see PendingNav): the
 * skeletons for each page are drawn here, once, and shown the moment a link
 * is pressed, without waiting on the server.
 *
 * The footer is left out. It is for people deciding whether to use the
 * product; everyone here already has.
 */
export default function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<PendingNavProvider
			skeletons={{
				toolbar: <ToolbarSkeleton />,
				organized: <OrganizedLoading />,
				attending: <AttendingLoading />,
				eventHeader: <EventHeaderSkeleton />,
				overview: <OverviewLoading />,
				edit: <EventPageLoading />,
				formBuilder: <FormBuilderLoading />,
				guests: <GuestsLoading />,
				section: <SectionLoading />,
			}}
		>
			<SiteHeader wide />
			<PendingSlot level="dashboard">{children}</PendingSlot>
		</PendingNavProvider>
	);
}
