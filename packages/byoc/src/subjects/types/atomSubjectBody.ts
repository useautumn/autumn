import type { Catalog, SubjectState } from "@autumn/balance-engine";
import type { SharedContext } from "@autumn/shared";

export type AtomSubjectBody = {
	state: SubjectState;
	catalog: Catalog;
	org: SharedContext["org"];
	log_offset: string;
	read_at: number;
	customer_version?: string;
};
