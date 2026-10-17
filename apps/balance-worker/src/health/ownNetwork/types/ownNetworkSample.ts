export type PartitionSendSample = {
	partition: number;
	holding: number;
	longestInFlightMs: number;
};

export type OwnNetworkSample = {
	at: number;
	tcp: { outSegs: number; retransSegs: number } | null;
	sends: PartitionSendSample[];
};
