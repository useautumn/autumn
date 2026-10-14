import type { SubjectState } from "@autumn/balance-engine";
import type { DeletedSubjectSnapshot } from "@autumn/postgres";

export type SnapshotQueues = {
	enqueueDelete(params: {
		topic: string;
		partition: number;
		customerKey: string;
	}): void;
	deleteLanded(params: {
		topic: string;
		partition: number;
		customerKey: string;
	}): Promise<DeletedSubjectSnapshot[]>;
	enqueueRefresh(params: {
		topic: string;
		partition: number;
		state: SubjectState;
		baselineAt: number;
		logOffset: bigint;
	}): void;
};
