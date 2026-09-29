import type {
	CatalogRow,
	CheckCommand,
	MeteringIdentity,
	SubjectState,
	TrackCommand,
} from "@autumn/balance-engine";
import type {
	BalanceWorkerClient,
	CheckReply,
	TrackReply,
} from "@autumn/balance-worker-client";

export type ReplayHydrationBaseline = Readonly<{
	id: string;
	capturedAtMs: number;
}>;

export type ReplayHydrationSelection = Readonly<{
	identity: Readonly<MeteringIdentity>;
	baseline: ReplayHydrationBaseline;
	featureIds: readonly string[];
}>;

export type ReplayHydrationSourceRefusalCategory = "missing" | "unsupported";

export type ReplayHydrationSourceResult =
	| Readonly<{
			kind: "loaded";
			state: SubjectState;
			catalogRows: CatalogRow[];
	  }>
	| Readonly<{
			kind: "refused";
			category: ReplayHydrationSourceRefusalCategory;
			reason: string;
	  }>;

export type ReplayHydrationSource = {
	load(params: {
		selection: ReplayHydrationSelection;
		signal: AbortSignal;
	}): Promise<ReplayHydrationSourceResult>;
};

export type ReplayHydrationWorkerClient = Pick<
	BalanceWorkerClient,
	"check" | "track" | "initialize"
>;

export type ReplayHydrationConfig = Readonly<{
	maxActive?: number;
	maxQueued?: number;
	deadlineMs?: number;
}>;

export type ReplayHydrationClock = Readonly<{
	now: () => number;
	setTimeout: (callback: () => void, delayMs: number) => unknown;
	clearTimeout: (timer: unknown) => void;
}>;

/** `initialized` is a fresh write; `duplicate` a retry of one; `already_initialized` found state; `already_ready` never needed to initialize. */
export type ReplayHydrationOutcome =
	| "initialized"
	| "duplicate"
	| "already_initialized"
	| "already_ready";

export type ReplayHydrationResult = Readonly<{
	kind: ReplayHydrationOutcome;
	freshParity: boolean;
}>;

export type ReplayHydrationCoordinator = {
	check(params: {
		selection: ReplayHydrationSelection;
		command: CheckCommand;
		signal?: AbortSignal;
	}): Promise<CheckReply>;
	track(params: {
		selection: ReplayHydrationSelection;
		command: TrackCommand;
		signal?: AbortSignal;
	}): Promise<TrackReply>;
	prewarm(params: {
		selection: ReplayHydrationSelection;
		signal?: AbortSignal;
	}): Promise<ReplayHydrationResult>;
	close(): Promise<void>;
};
