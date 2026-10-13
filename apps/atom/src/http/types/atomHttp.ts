import type { AutumnLogger } from "@autumn/logging";
import type { SecretKeys } from "../../auth/secretKeys/types/secretKeys.js";
import type { Auth } from "../../auth/types/auth.js";
import type { ThreadHealthSource } from "../../init/atomHealth.js";
import type { MultiTenantContext } from "../../multiTenant/multiTenantContext.js";
import type { Replication } from "../../replication/types/replication.js";
import type { Slots } from "../../slots/types/slots.js";
import type { ThreadCounters } from "../../threads/stats/threadStats.js";

export type AtomHttpContext = {
	auth: Auth;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	/** Where a request Atom does not answer itself is sent. */
	autumnApiUrl: string;
	health: ThreadHealthSource;
	counters: ThreadCounters;
	/** Present only on a multi-tenant Atom. */
	multiTenant?: MultiTenantContext;
	/** Present only on an org's own Atom, whose checks open with the org's secret keys. */
	secretKeys?: SecretKeys;
	/** Keeps the other replicas holding what this thread applies. */
	replication: Replication;
	/** The port the other replicas answer checks on while this one starts; a test may send its own way. */
	peer: { port: number; fetch?: typeof fetch };
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
		/** Set only when Atom answered a check itself, so its line need not read the body. */
		allowed?: boolean;
		/** Set when another replica passed the request on: applied here, passed no further. */
		relayed?: boolean;
		failure?: AtomFailure;
	};
};
