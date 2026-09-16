import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/**
 * The slice of the request context the balance worker converters actually read,
 * so callers without a live database handle can build one.
 */
export type BalanceWorkerRequestContext = Pick<
	AutumnContext,
	"id" | "env" | "timestamp" | "expand"
> &
	Readonly<{ org: Pick<AutumnContext["org"], "id"> }>;
