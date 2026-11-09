import { accountRouter } from "./account.router";
import { checkinChainRouter } from "./checkin-chain.router";
import { communitiesRouter } from "./communities.router";
import { eventsRouter } from "./events.router";
import { invitesRouter } from "./invites.router";
import { organizersRouter } from "./organizers.router";
import { usersRouter } from "./users.router";
import { router } from "./trpc";

export const appRouter = router({
	account: accountRouter,
	checkinChain: checkinChainRouter,
	communities: communitiesRouter,
	events: eventsRouter,
	invites: invitesRouter,
	organizers: organizersRouter,
	users: usersRouter,
});

export type AppRouter = typeof appRouter;
