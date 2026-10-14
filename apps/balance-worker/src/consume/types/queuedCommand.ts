import type { DecidedMutation } from "../../processor/writer/types/mutation.js";

export type QueuedCommand = {
	decided: Pick<DecidedMutation<unknown>, "waitForCommit">;
	onRefused?: () => Promise<void>;
};
