import type { AutumnLogger } from "@autumn/logging";
import type { SecretKeys } from "../../auth/secretKeys/types/secretKeys.js";
import type { Auth } from "../../auth/types/auth.js";
import type { AtomHealthSource } from "../../init/atomHealth.js";
import type { MultiTenantContext } from "../../multiTenant/multiTenantContext.js";
import type { PeerRelay } from "../../peers/types/peerRelay.js";
import type { Slots } from "../../slots/types/slots.js";
import type { ThreadCounters } from "../../threads/stats/threadStats.js";

export type AtomHttpContext = {
	auth: Auth;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	/** Where a request Atom does not answer itself is sent. */
	autumnApiUrl: string;
	health: AtomHealthSource;
	counters: ThreadCounters;
	/** Present only on a multi-tenant Atom. */
	multiTenant?: MultiTenantContext;
	/** Present only on an org's own Atom, whose checks open with the org's secret keys. */
	secretKeys?: SecretKeys;
	/** Present only on an org's own Atom: passes Autumn's pushes on to the other replicas. */
	peerRelay?: PeerRelay;
	/** The token hash a relayed push is signed with; only an org's own Atom has peers. */
	peerTokenHash?: string;
};

/** How a request failed, as its error response said; the request line carries it. */
export type AtomFailure = {
	code: string;
	error: Error;
	/** The Autumn API URL a forward was going to, when that is what failed. */
	target?: string;
};

/** Set along the way: the body read once for every layer, the data the request's token opens, an answered check's verdict, and how it failed. */
export type AtomHttpEnv = {
	Variables: {
		/** The request's JSON, or undefined when it carried none that parses. */
		body: unknown;
		slots: Slots;
		/** Set when another replica passed the push on, so it goes no further. */
		relayed?: boolean;
		/** Set only when Atom answered a check itself, so its line need not read the body. */
		allowed?: boolean;
		failure?: AtomFailure;
	};
};
