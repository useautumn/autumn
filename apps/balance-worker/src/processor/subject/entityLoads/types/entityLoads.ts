import type { MeteringIdentity } from "@autumn/balance-engine";
import type { InFlightRead } from "../../inFlightLoads/types/inFlightLoad.js";
import type { SubjectRead } from "../../types/subjectRead.js";

export type EntityLoads = {
	load(params: {
		identity: MeteringIdentity;
		rowsOnly: boolean;
	}): Promise<InFlightRead>;
};

export type WaitingEntity = {
	identity: MeteringIdentity;
	rowsOnly: boolean;
	settle: ReturnType<typeof Promise.withResolvers<SubjectRead>>;
};
