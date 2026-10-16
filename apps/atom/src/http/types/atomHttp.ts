import type { AutumnLogger } from "@autumn/logging";
import type { SecretKeys } from "../../auth/secretKeys/types/secretKeys.js";
import type { Auth } from "../../auth/types/auth.js";
import type { ThreadHealthSource } from "../../init/atomHealth.js";
import type { MultiTenantContext } from "../../multiTenant/multiTenantContext.js";
import type { Membership } from "../../replicas/membership/types/membership.js";
import type { ReplicaRing } from "../../replicas/types/replicaRing.js";
import type { Replication } from "../../replication/types/replication.js";
import type { Slots } from "../../slots/types/slots.js";
import type { LoopWatch } from "../../threads/stats/startLoopWatch.js";
import type { ThreadCounters } from "../../threads/stats/threadStats.js";

export type AtomHttpContext = {
	auth: Auth;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	/** Where a request Atom does not answer itself is sent. */
	autumnApiUrl: string;
	health: ThreadHealthSource;
	counters: ThreadCounters;
	/** How far behind this thread is: checks are refused while it is too far. */
	loop: Pick<LoopWatch, "lagMs">;
	/** Present only on a multi-tenant Atom. */
	multiTenant?: MultiTenantContext;
	/** Present only on an org's own Atom, whose checks open with the org's secret keys. */
	secretKeys?: SecretKeys;
	/** Keeps the other replicas holding what this thread applies. */
	replication: Replication;
	/** Where a check this replica does not answer goes: the owner's peer port, signed with the deployment's secret; a test may send its own way. */
	peer: {
		port: number;
		secret: string;
		ring: ReplicaRing;
		/** Who counts as a ring member beyond the service name: a peer that announced leaving does not. */
		membership?: Membership;
		fetch?: typeof fetch;
	};
	/** True once this thread stops taking checks: one a peer hands on is refused, and so goes to the API. */
	stopping?: () => boolean;
	/** This replica's clock; a test runs it. */
	now?: () => number;
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
		/** Set by the ring hop when the customer just moved here from a leaving replica: its answer waits for the handoff. */
		movedFrom?: string;
		/** Set only when Atom answered a check itself, so its line need not read the body. */
		allowed?: boolean;
		/** Set when another replica passed the request on: applied here, passed no further. */
		relayed?: boolean;
		/** The id a check, track or finalize is known by, here and in Autumn's journal. */
		requestId?: string;
		/** The key the request's deduction carries to Autumn, when the caller named one. */
		idempotencyKey?: string | null;
		failure?: AtomFailure;
	};
};
