import type { TrackCommand } from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";

export type BalanceShadowConfig = {
	runId: string;
	ownershipTopic: string;
	expiresAt: number;
	customers: {
		orgId: string;
		env: "live" | "sandbox";
		customerId: string;
		featureId: string;
	}[];
};

export type BalanceShadowSource = {
	kind: "returned" | "rejected";
	remaining?: number;
	usage?: number;
};

export type BalanceShadowTrack = {
	command: TrackCommand;
	source: BalanceShadowSource;
};

export type BalanceShadowDependencies = {
	client: Pick<BalanceWorkerClient, "track">;
	report: (event: Record<string, unknown>) => void;
};

export type BalanceShadow = {
	submit: (track: BalanceShadowTrack) => boolean;
	record: (event: Record<string, unknown>) => void;
	status: () => {
		submitted: number;
		completed: number;
		failed: number;
		dropped: number;
		pending: number;
		inFlight: number;
	};
	stop: () => Promise<void>;
};
