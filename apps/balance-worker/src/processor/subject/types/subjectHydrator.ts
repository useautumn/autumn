import type {
	Catalog,
	CustomerState,
	MeteringIdentity,
} from "@autumn/balance-engine";
import type { Subject } from "./subject.js";

/** Resolves what a command computes against: the customer's state and the catalog rows it references. */
export type SubjectHydrator = {
	/** Async, before the writer: hydrates a missing customer, loads missing catalog rows. */
	ensure(params: { identity: MeteringIdentity }): Promise<Subject>;
	/** Sync, inside the critical section on the freshest state; `ensure` already filled the cache. */
	readCatalog(params: { state: CustomerState }): Catalog;
};
