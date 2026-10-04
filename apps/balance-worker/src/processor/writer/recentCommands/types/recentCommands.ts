import type { MeteringIdentity, MutationRecord } from "@autumn/balance-engine";

/** What a retry must match; the record itself lives only on the log. */
export type RememberedCommand = { fingerprint: string };

export type CommandAddress = { identity: MeteringIdentity; commandId: string };

/** Unseen inside the window, seen with this fingerprint (a retry), or seen with another (a conflict). */
export type CommandRecall = "unknown" | "same" | "different";

/**
 * One partition's memory of the commands that landed, kept for one to two windows.
 * The writer's commits and the records replayed from the log both feed it.
 * A caller that already holds the key (the writer's pending key is the same string) passes it instead.
 */
export type RecentCommands = {
	keyOf(params: CommandAddress): string;
	recall(params: { key: string; fingerprint: string }): CommandRecall;
	remember(
		params: { mutation: MutationRecord } | { key: string; fingerprint: string },
	): void;
	/** A settled batch under one clock read: commands that were recalled unknown when decided. */
	rememberAll(params: {
		commands: Iterable<{ key: string; fingerprint: string }>;
	}): void;
	size(): number;
};

/** The map-backed memory also hands back the fingerprint it holds. */
export type ReadableRecentCommands = RecentCommands & {
	read(params: CommandAddress | { key: string }): RememberedCommand | null;
};
