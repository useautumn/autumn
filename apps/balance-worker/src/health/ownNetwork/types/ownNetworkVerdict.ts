export type OwnNetworkState = "healthy" | "degraded" | "insufficient_data";

export type OwnNetworkVerdict = {
	state: OwnNetworkState;
	at: number;
	windowStartedAt: number | null;
	segments: number;
	retransmitRatio: number | null;
	busyPartitions: number;
	stalledPartitions: number;
	losesPackets: boolean;
};
