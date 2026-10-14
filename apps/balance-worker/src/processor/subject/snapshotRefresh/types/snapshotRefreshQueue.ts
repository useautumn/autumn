import type { MeteringIdentity } from "@autumn/balance-engine";
import type {
	EdgeConfigStore,
	SubjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import type { SubjectRead } from "../../types/subjectRead.js";

export type SnapshotRefreshRead = SubjectRead & { logOffset: bigint };

export type SnapshotRefreshCounts = {
	queued: number;
	refreshed: number;
	skipped: number;
	failed: number;
};

export type SnapshotRefreshQueueContext = {
	read(params: {
		identity: MeteringIdentity;
	}): Promise<SnapshotRefreshRead | null>;
	write(params: {
		identity: MeteringIdentity;
		read: SnapshotRefreshRead;
	}): void;
	subjectSnapshotsConfig: Pick<
		EdgeConfigStore<SubjectSnapshotsEdgeConfig>,
		"get"
	>;
	recordCounts?(counts: Partial<SnapshotRefreshCounts>): void;
	logger?: Partial<Pick<AutumnLogger, "warn">>;
};

export type SnapshotRefreshQueue = {
	enqueue(params: {
		customer: MeteringIdentity;
		subjects: readonly MeteringIdentity[];
	}): void;
	depth(): number;
	counts(): SnapshotRefreshCounts;
	settled(): Promise<void>;
	dispose(): void;
};
