import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import type {
	CommandAddress,
	RecentCommands,
	RememberedCommand,
} from "./types/recentCommands.js";

type Generations = {
	current: Map<string, RememberedCommand>;
	previous: Map<string, RememberedCommand>;
	currentStartedAt: number;
};

/** Two customers may reuse the same idempotency key, so the customer is part of the key. */
const commandKeyOf = ({ identity, commandId }: CommandAddress): string =>
	JSON.stringify([meteringIdentityToPartitionKey({ identity }), commandId]);

/** A whole generation is dropped at once, so forgetting costs nothing per command. */
const rotateGenerations = ({
	generations,
	windowMs,
	now,
}: {
	generations: Generations;
	windowMs: number;
	now: number;
}) => {
	const elapsed = now - generations.currentStartedAt;
	if (elapsed < windowMs) return;
	const previousIsStale = elapsed >= 2 * windowMs;
	generations.previous = previousIsStale ? new Map() : generations.current;
	generations.current = new Map();
	// Aligned to the window, so a late first access does not stretch the next generation.
	generations.currentStartedAt = now - (elapsed % windowMs);
};

export const createRecentCommands = ({
	windowMs,
	now,
}: {
	windowMs: number;
	now(): number;
}): RecentCommands => {
	const generations: Generations = {
		current: new Map(),
		previous: new Map(),
		currentStartedAt: now(),
	};

	const remember = (params: Parameters<RecentCommands["remember"]>[0]) => {
		rotateGenerations({ generations, windowMs, now: now() });
		const commandKey =
			"key" in params
				? params.key
				: commandKeyOf({
						identity: params.mutation.identity,
						commandId: params.mutation.id,
					});
		const fingerprint =
			"key" in params
				? params.fingerprint
				: params.mutation.receipt.fingerprint;
		generations.previous.delete(commandKey);
		generations.current.set(commandKey, { fingerprint });
	};

	const rememberAll = ({
		commands,
	}: Parameters<RecentCommands["rememberAll"]>[0]) => {
		rotateGenerations({ generations, windowMs, now: now() });
		for (const { key, fingerprint } of commands) {
			generations.previous.delete(key);
			generations.current.set(key, { fingerprint });
		}
	};

	const read = (
		params: Parameters<RecentCommands["read"]>[0],
	): RememberedCommand | null => {
		rotateGenerations({ generations, windowMs, now: now() });
		const commandKey = "key" in params ? params.key : commandKeyOf(params);
		return (
			generations.current.get(commandKey) ??
			generations.previous.get(commandKey) ??
			null
		);
	};

	const size = () => generations.current.size + generations.previous.size;

	return { keyOf: commandKeyOf, remember, rememberAll, read, size };
};
