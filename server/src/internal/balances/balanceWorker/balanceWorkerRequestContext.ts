import type { CommandOrg } from "@autumn/balance-engine";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/**
 * The slice of the request context the balance worker converters actually read,
 * so callers without a live database handle can build one.
 */
export type BalanceWorkerRequestContext = Pick<
	AutumnContext,
	"id" | "env" | "timestamp" | "expand"
> &
	Readonly<{
		org: Pick<AutumnContext["org"], "id"> &
			Partial<Pick<AutumnContext["org"], "slug">> & {
				config: CommandOrg["config"];
			};
		features: Pick<AutumnContext["features"][number], "id" | "internal_id">[];
	}>;
