import type { AutumnLogger } from "@autumn/logging";
import type { Auth } from "../../auth/types/auth.js";
import type { AtomHealthSource } from "../../init/atomHealth.js";
import type { MultiTenantContext } from "../../multiTenant/multiTenantContext.js";
import type { CheckAnswer } from "../../processor/types/slotProcessor.js";
import type { Slots } from "../../slots/types/slots.js";
import type { CheckCounts } from "../../threads/stats/checkCounts.js";
import type { ThreadCounters } from "../../threads/stats/threadStats.js";

export type AtomHttpContext = {
	auth: Auth;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	/** Where a request Atom does not answer itself is sent. */
	autumnApiUrl: string;
	health: AtomHealthSource;
	counters: ThreadCounters;
	checkCounts: CheckCounts;
	/** The share of allowed checks that get a request line. */
	allowLogSampleRate: number;
	/** Present only on a multi-tenant Atom. */
	multiTenant?: MultiTenantContext;
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
		verdict?: Omit<CheckAnswer, "json">;
		failure?: AtomFailure;
	};
};
