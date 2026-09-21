import type {
	Catalog,
	MeteringIdentity,
	SubjectState,
	WorkerFullSubject,
} from "@autumn/balance-engine";
import type { Subject } from "./subject.js";

/** Resolves what a command computes against: the customer's state and the catalog rows it references. */
export type SubjectHydrator = {
	/** Async, before the writer: hydrates a missing customer, loads missing catalog rows. */
	ensure(params: { identity: MeteringIdentity }): Promise<Subject>;
	/** Sync, inside the critical section on the freshest state: the FullSubject-shaped view the command computes against. */
	readSubject(params: {
		state: SubjectState;
		identity: MeteringIdentity;
	}): WorkerFullSubject;
	/** Sync: the catalog rows that view was joined from, which a reply hands to the server so it need not load them. */
	readCatalog(params: { state: SubjectState }): Catalog;
};
