import type { AutumnLogger } from "@autumn/logging";
import type { Auth } from "../../auth/types/auth.js";
import type { SharedContext } from "../../shared/sharedContext.js";
import type { Slots } from "../../slots/types/slots.js";

export type AtomHttpContext = {
	auth: Auth;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	/** Where a request Atom does not answer itself is sent. */
	autumnApiUrl: string;
	/** Present only on a shared Atom. */
	shared?: SharedContext;
};

/** How a request failed, as its error response said; the request line carries it. */
export type AtomFailure = {
	code: string;
	error: Error;
	/** The Autumn API URL a forward was going to, when that is what failed. */
	target?: string;
};

/** Set along the way: the body read once for every layer, the data the request's token opens, and how it failed. */
export type AtomHttpEnv = {
	Variables: {
		/** The request's JSON, or undefined when it carried none that parses. */
		body: unknown;
		slots: Slots;
		failure?: AtomFailure;
	};
};
