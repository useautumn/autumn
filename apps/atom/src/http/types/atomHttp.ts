import type { AutumnLogger } from "@autumn/logging";
import type { Auth } from "../../auth/types/auth.js";
import type { DevContext } from "../../dev/devContext.js";
import type { Slots } from "../../slots/types/slots.js";

export type AtomHttpContext = {
	auth: Auth;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	/** Where a request Atom does not answer itself is sent. */
	autumnApiUrl: string;
	/** Present only on a dev stack. */
	dev?: DevContext;
};

/** Set by the token middleware: the data the request's token opens. */
export type AtomHttpEnv = { Variables: { slots: Slots } };
