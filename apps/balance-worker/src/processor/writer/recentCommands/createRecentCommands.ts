import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
} from "@autumn/balance-engine";
import type {
	RecentCommands,
	RememberedCommand,
} from "./types/recentCommands.js";

type Generations = {
	current: Map<string, RememberedCommand>;
	previous: Map<string, RememberedCommand>;
	currentStartedAt: number;
};

const commandKeyOf = ({
	identity,
	commandId,
}: {
	identity: MeteringIdentity;
	commandId: string;
}): string =>
	JSON.stringify([meteringIdentityToPartitionKey({ identity }), commandId]);

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

	const remember = ({
		mutation,
	}: Parameters<RecentCommands["remember"]>[0]) => {
		rotateGenerations({ generations, windowMs, now: now() });
		const commandKey = commandKeyOf({
			identity: mutation.identity,
			commandId: mutation.id,
		});
		generations.previous.delete(commandKey);
		generations.current.set(commandKey, {
			fingerprint: mutation.receipt.fingerprint,
		});
	};

	const read = ({
		identity,
		commandId,
	}: Parameters<RecentCommands["read"]>[0]): RememberedCommand | null => {
		rotateGenerations({ generations, windowMs, now: now() });
		const commandKey = commandKeyOf({ identity, commandId });
		return (
			generations.current.get(commandKey) ??
			generations.previous.get(commandKey) ??
			null
		);
	};

	const size = () => generations.current.size + generations.previous.size;

	return { remember, read, size };
};
