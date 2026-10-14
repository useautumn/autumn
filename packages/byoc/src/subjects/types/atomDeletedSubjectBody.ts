import type { MeteringIdentity } from "@autumn/balance-engine";

export type AtomDeletedSubjectBody = {
	identity: MeteringIdentity;
	log_offset: string;
	read_at: number;
};
