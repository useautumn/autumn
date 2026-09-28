import type { InitializeRequest, SubjectState } from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerInitializeRequest = {
	route: PartitionRoute;
	command: InitializeRequest["command"];
	payload: Pick<InitializeRequest, "state" | "catalogRows">;
};
/** `initialized` wrote the baseline, `duplicate` when that write was a retry; `already_initialized` found one and wrote nothing. */
export type InitializeReply = {
	result: {
		status: "initialized" | "already_initialized";
		duplicate: boolean;
	};
	state: SubjectState;
};
