import type {
	CheckCommand,
	CheckDecision,
	CustomerMeteringState,
	InitializationDecision,
	MeteringIdentity,
	TrackCommand,
	TrackDecision,
} from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";

export type BalanceHydrationBaseline = Readonly<{
	id: string;
	capturedAtMs: number;
}>;

export type BalanceHydrationSelection = Readonly<{
	identity: Readonly<MeteringIdentity>;
	baseline: BalanceHydrationBaseline;
	featureIds: readonly string[];
}>;

export type BalanceHydrationSourceRefusalCategory = "missing" | "unsupported";

export type BalanceHydrationSourceResult =
	| Readonly<{ kind: "loaded"; state: CustomerMeteringState }>
	| Readonly<{
			kind: "refused";
			category: BalanceHydrationSourceRefusalCategory;
			reason: string;
	  }>;

export type BalanceHydrationSource = {
	load(params: {
		selection: BalanceHydrationSelection;
		signal: AbortSignal;
	}): Promise<BalanceHydrationSourceResult>;
};

export type BalanceHydrationWorkerClient = Pick<
	BalanceWorkerClient,
	"check" | "track" | "initialize"
>;

export type BalanceHydrationConfig = Readonly<{
	maxActive?: number;
	maxQueued?: number;
	deadlineMs?: number;
}>;

export type BalanceHydrationClock = Readonly<{
	now: () => number;
	setTimeout: (callback: () => void, delayMs: number) => unknown;
	clearTimeout: (timer: unknown) => void;
}>;

export type BalanceHydrationResult = Readonly<{
	kind: InitializationDecision["kind"] | "already_ready";
	freshParity: boolean;
}>;

export type BalanceHydrationCoordinator = {
	check(params: {
		selection: BalanceHydrationSelection;
		command: CheckCommand;
		signal?: AbortSignal;
	}): Promise<CheckDecision>;
	track(params: {
		selection: BalanceHydrationSelection;
		command: TrackCommand;
		signal?: AbortSignal;
	}): Promise<TrackDecision>;
	prewarm(params: {
		selection: BalanceHydrationSelection;
		signal?: AbortSignal;
	}): Promise<BalanceHydrationResult>;
	close(): Promise<void>;
};
