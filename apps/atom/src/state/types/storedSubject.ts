import type {
	Catalog,
	MeteringIdentity,
	SubjectState,
} from "@autumn/balance-engine";
import type { SharedContext } from "@autumn/shared";

export type StoredSubject = {
	state: SubjectState;
	catalog: Catalog;
	org: SharedContext["org"];
	logOffset: bigint;
	readAt: number;
	customerVersion: bigint;
};

export type DeletedSubject = Pick<
	StoredSubject,
	"logOffset" | "readAt" | "customerVersion"
> & {
	state: { identity: MeteringIdentity; deleted: true };
	catalog: null;
	org: null;
};

export type SubjectRow = StoredSubject | DeletedSubject;

export const isDeletedSubject = (row: SubjectRow): row is DeletedSubject =>
	"deleted" in row.state;
