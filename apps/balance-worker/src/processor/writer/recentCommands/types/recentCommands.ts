import type { MeteringIdentity, MutationRecord } from "@autumn/balance-engine";

/** What a retry must match; the record itself lives only on the log. */
export type RememberedCommand = { fingerprint: string };

/**
 * One partition's memory of the commands that landed, kept for one to two windows.
 * The writer's commits and the records replayed from the log both feed it.
 */
export type RecentCommands = {
	remember(params: { mutation: MutationRecord }): void;
	read(params: {
		identity: MeteringIdentity;
		commandId: string;
	}): RememberedCommand | null;
	size(): number;
};
