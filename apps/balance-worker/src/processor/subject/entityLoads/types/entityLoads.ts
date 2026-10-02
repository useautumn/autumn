import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";

export type EntityLoads = {
	load(params: { identity: MeteringIdentity }): Promise<SubjectState>;
};
