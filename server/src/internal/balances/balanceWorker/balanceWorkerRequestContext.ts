import type { CommandOrg } from "@autumn/balance-engine";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export type BalanceWorkerRequestContext = Pick<
	AutumnContext,
	"id" | "env" | "timestamp" | "expand" | "testOptions"
> &
	Readonly<{
		org: Pick<AutumnContext["org"], "id"> &
			Partial<Pick<AutumnContext["org"], "slug" | "svix_config">> & {
				config: CommandOrg["config"];
			};
		features: Pick<
			AutumnContext["features"][number],
			"id" | "internal_id" | "event_names"
		>[];
	}>;
