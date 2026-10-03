import type { MeteringIdentity } from "@autumn/balance-engine";
import type { InFlightRead } from "../../inFlightLoads/types/inFlightLoad.js";
import type { SubjectRead } from "../../types/subjectRead.js";

export type EntityLoads = {
	/** The entity's rows, read with its customer's other cold entities; shared with every caller asking while it reads.
	 *  `rowsOnly` skips the snapshot probe, as a read an evict overtook must. */
	load(params: {
		identity: MeteringIdentity;
		rowsOnly: boolean;
	}): Promise<InFlightRead>;
};

/** One entity waiting for its customer's next batch, and the promise its caller holds. */
export type WaitingEntity = {
	identity: MeteringIdentity;
	rowsOnly: boolean;
	settle: ReturnType<typeof Promise.withResolvers<SubjectRead>>;
};
