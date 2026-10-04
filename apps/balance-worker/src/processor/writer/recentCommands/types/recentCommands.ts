import type { MeteringIdentity, MutationRecord } from "@autumn/balance-engine";

/** What a retry must match; the record itself lives only on the log. */
export type RememberedCommand = { fingerprint: string };

export type CommandAddress = { identity: MeteringIdentity; commandId: string };

/**
 * One partition's memory of the commands that landed, kept for one to two windows.
 * The writer's commits and the records replayed from the log both feed it.
 * A caller that already holds the key (the writer's pending key is the same string) passes it instead.
 */
export type RecentCommands = {
	keyOf(params: CommandAddress): string;
	remember(
		params: { mutation: MutationRecord } | { key: string; fingerprint: string },
	): void;
	/** A settled batch under one clock read. */
	rememberAll(params: {
		commands: Iterable<{ key: string; fingerprint: string }>;
	}): void;
	read(params: CommandAddress | { key: string }): RememberedCommand | null;
	size(): number;
};
