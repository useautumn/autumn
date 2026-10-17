import type { OwnNetworkVerdict } from "./ownNetworkVerdict.js";

export type OwnNetworkMonitor = {
	start(): void;
	stop(): void;
	verdict(): OwnNetworkVerdict;
	onDegraded(listener: (verdict: OwnNetworkVerdict) => void): () => void;
};
