import type { MeteringIdentity } from "@autumn/balance-engine";
import type { InFlightRead } from "../../inFlightLoads/types/inFlightLoad.js";

export type EntityLoads = {
	/** The entity's rows, read with its customer's other cold entities; shared with every caller asking while it reads. */
	load(params: { identity: MeteringIdentity }): Promise<InFlightRead>;
};
