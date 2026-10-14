import type {
	Catalog,
	MeteringIdentity,
	RowChange,
	SubjectState,
	WorkerFullSubject,
} from "@autumn/balance-engine";
import type { Subject } from "./subject.js";

export type SubjectHydrator = {
	ensure(params: { identity: MeteringIdentity }): Promise<Subject>;
	readSubject(params: {
		state: SubjectState;
		identity: MeteringIdentity;
	}): WorkerFullSubject;
	ensureCatalog(params: {
		identity: MeteringIdentity;
		state: SubjectState;
	}): Promise<Catalog>;
	peekCatalog(params: { state: SubjectState }): Catalog | null;
	readCatalog(params: { state: SubjectState }): Catalog;
	readSubjectWith(params: {
		state: SubjectState;
		catalog: Catalog;
		identity: MeteringIdentity;
	}): WorkerFullSubject;
	overtakeInFlightLoads(params: { customerKey: string }): void;
	refreshSnapshots(params: {
		customer: MeteringIdentity;
		subjects: readonly MeteringIdentity[];
	}): void;
	dispose(): void;
	inheritCatalog(params: {
		from: SubjectState | null;
		to: SubjectState;
		changes: RowChange[];
	}): void;
};
