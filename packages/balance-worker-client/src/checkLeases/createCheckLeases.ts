import type { CheckCommand, MeteringIdentity } from "@autumn/balance-engine";
import type { CheckReply } from "../contracts/check.js";
import type {
	CheckLeaseCounters,
	CheckLeases,
	CheckLeasesConfig,
} from "./types/checkLeases.js";

const DEFAULT_MAX_TTL_MS = 1_000;

type HeldLease = {
	reply: CheckReply;
	expiresAt: number;
	sentAt: number;
	customerKey: string;
	orgKey: string;
};

function orgKeyOf({ orgId, env }: { orgId: string; env: string }): string {
	return JSON.stringify([orgId, env]);
}

function customerKeyOf(identity: MeteringIdentity): string {
	return JSON.stringify([identity.orgId, identity.env, identity.customerId]);
}

/** Everything in a check command that can change its answer; null when event properties make it unleasable. */
function leaseKeyOf({ command }: { command: CheckCommand }): string | null {
	if (command.properties !== null) return null;
	const { identity } = command;
	return JSON.stringify([
		identity.orgId,
		identity.env,
		identity.customerId,
		identity.entityId,
		command.featureId,
		command.internalFeatureId,
		command.requiredBalance,
		command.org.config,
	]);
}

/** Owner-issued check leases held on this server: a bounded LRU of replies, each until its lease or `maxTtlMs` lapses. */
export function createCheckLeases({
	ctx = {},
	config,
}: {
	ctx?: { now?: () => number };
	config: CheckLeasesConfig;
}): CheckLeases {
	const now = ctx.now ?? Date.now;
	const maxTtlMs = config.maxTtlMs ?? DEFAULT_MAX_TTL_MS;
	// Both maps are in recency order: re-inserting moves a key to the end.
	const held = new Map<string, HeldLease>();
	const invalidatedAt = new Map<string, number>();
	const counters: Omit<CheckLeaseCounters, "size"> = {
		leaseHit: 0,
		leaseMiss: 0,
		leaseIssued: 0,
		leaseBypassDenied: 0,
		leaseWithheld: 0,
		leaseEvicted: 0,
	};

	function invalidatedSince({
		key,
		sentAt,
	}: {
		key: string;
		sentAt: number;
	}): boolean {
		const at = invalidatedAt.get(key);
		return at !== undefined && at >= sentAt;
	}

	function isGood({ lease, at }: { lease: HeldLease; at: number }): boolean {
		return (
			at < lease.expiresAt &&
			!invalidatedSince({ key: lease.customerKey, sentAt: lease.sentAt }) &&
			!invalidatedSince({ key: lease.orgKey, sentAt: lease.sentAt })
		);
	}

	function read({ key }: { key: string }): CheckReply | null {
		const lease = held.get(key);
		if (!lease) return null;
		held.delete(key);
		if (!isGood({ lease, at: now() })) return null;
		held.set(key, lease);
		return lease.reply;
	}

	function dropLapsedOldest({ at }: { at: number }): void {
		// Bounded work per insert keeps memory near the live set without a sweep timer.
		for (let dropped = 0; dropped < 2; dropped++) {
			const oldest = held.entries().next().value;
			if (!oldest || isGood({ lease: oldest[1], at })) return;
			held.delete(oldest[0]);
		}
	}

	function hold({
		key,
		command,
		reply,
		sentAt,
	}: {
		key: string;
		command: CheckCommand;
		reply: CheckReply;
		sentAt: number;
	}): void {
		if (!reply.result.allowed) {
			counters.leaseBypassDenied++;
			return;
		}
		const at = now();
		const lease: HeldLease = {
			reply,
			// The owner's clock bounds the answer's age; ours bounds it if the clocks disagree.
			expiresAt: Math.min(
				reply.lease?.expiresAt ?? Number.NEGATIVE_INFINITY,
				sentAt + maxTtlMs,
			),
			sentAt,
			customerKey: customerKeyOf(command.identity),
			orgKey: orgKeyOf(command.identity),
		};
		if (!isGood({ lease, at })) {
			counters.leaseWithheld++;
			return;
		}
		dropLapsedOldest({ at });
		held.delete(key);
		held.set(key, lease);
		counters.leaseIssued++;
		if (held.size <= config.maxEntries) return;
		const oldest = held.keys().next().value;
		if (oldest === undefined) return;
		held.delete(oldest);
		counters.leaseEvicted++;
	}

	async function answer({
		command,
		send,
	}: {
		command: CheckCommand;
		send: () => Promise<CheckReply>;
	}): Promise<CheckReply> {
		const key = leaseKeyOf({ command });
		const leased = key === null ? null : read({ key });
		if (leased) {
			counters.leaseHit++;
			return leased;
		}
		counters.leaseMiss++;
		const sentAt = now();
		const reply = await send();
		if (key !== null) hold({ key, command, reply, sentAt });
		return reply;
	}

	function invalidate({ key }: { key: string }): void {
		const at = now();
		invalidatedAt.delete(key);
		invalidatedAt.set(key, at);
		// A mark older than the longest lease can no longer match one: its replies were sent before it and have lapsed.
		for (const [oldKey, oldAt] of invalidatedAt) {
			if (oldAt >= at - maxTtlMs) return;
			invalidatedAt.delete(oldKey);
		}
	}

	async function invalidatingKeys<Result>({
		keys,
		run,
	}: {
		keys: string[];
		run: () => Promise<Result>;
	}): Promise<Result> {
		// Before, so no held reply answers during the write; after, so no reply decided before it lands is held.
		for (const key of keys) invalidate({ key });
		try {
			return await run();
		} finally {
			for (const key of keys) invalidate({ key });
		}
	}

	function invalidating<Result>({
		identities,
		run,
	}: {
		identities: readonly MeteringIdentity[];
		run: () => Promise<Result>;
	}): Promise<Result> {
		const keys = [...new Set(identities.map(customerKeyOf))];
		return invalidatingKeys({ keys, run });
	}

	function invalidatingOrg<Result>({
		orgId,
		env,
		run,
	}: {
		orgId: string;
		env: string;
		run: () => Promise<Result>;
	}): Promise<Result> {
		return invalidatingKeys({ keys: [orgKeyOf({ orgId, env })], run });
	}

	function readCounters(): CheckLeaseCounters {
		return { ...counters, size: held.size };
	}

	return { answer, invalidating, invalidatingOrg, readCounters };
}
