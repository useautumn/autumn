import type { CheckCommand, MeteringIdentity } from "@autumn/balance-engine";
import type { CheckReply } from "../contracts/check.js";
import type {
	CheckLeaseCounters,
	CheckLeases,
	CheckLeasesConfig,
	SharedCheckLeases,
} from "./types/checkLeases.js";

const DEFAULT_MAX_TTL_MS = 1_000;
const SHARED_KEY_PREFIX = "bw:check-lease:v1:";
/** Servers' clocks may disagree by this much: another server's lease must have been sent this long after our last write. */
const SHARED_CLOCK_SKEW_MS = 100;

/** What a server publishes: the reply and when it asked the owner, on its own clock. */
type SharedLease = { sentAt: number; reply: CheckReply };

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

/**
 * Owner-issued check leases held on this server: a bounded LRU of replies, each until its lease or `maxTtlMs`
 * lapses. With a shared store, a reply one server leased answers every server until the same deadline.
 */
export function createCheckLeases({
	ctx = {},
	config,
}: {
	ctx?: { now?: () => number; shared?: SharedCheckLeases };
	config: CheckLeasesConfig;
}): CheckLeases {
	const now = ctx.now ?? Date.now;
	const shared = ctx.shared;
	const maxTtlMs = config.maxTtlMs ?? DEFAULT_MAX_TTL_MS;
	// Both maps are in recency order: re-inserting moves a key to the end.
	const held = new Map<string, HeldLease>();
	const invalidatedAt = new Map<string, number>();
	const counters: Omit<CheckLeaseCounters, "size"> = {
		leaseHit: 0,
		leaseSharedHit: 0,
		leaseMiss: 0,
		leaseIssued: 0,
		leaseBypassDenied: 0,
		leaseWithheld: 0,
		leaseEvicted: 0,
		leaseSharedErrors: 0,
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

	function readHeld({ key }: { key: string }): CheckReply | null {
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

	/** Holds the lease if it is still good; true when held. */
	function holdLease({
		key,
		lease,
	}: {
		key: string;
		lease: HeldLease;
	}): boolean {
		const at = now();
		if (!isGood({ lease, at })) return false;
		dropLapsedOldest({ at });
		held.delete(key);
		held.set(key, lease);
		if (held.size > config.maxEntries) {
			const oldest = held.keys().next().value;
			if (oldest !== undefined) {
				held.delete(oldest);
				counters.leaseEvicted++;
			}
		}
		return true;
	}

	function leaseOf({
		command,
		reply,
		sentAt,
		expiresAt,
	}: {
		command: CheckCommand;
		reply: CheckReply;
		sentAt: number;
		expiresAt: number;
	}): HeldLease {
		return {
			reply,
			expiresAt,
			sentAt,
			customerKey: customerKeyOf(command.identity),
			orgKey: orgKeyOf(command.identity),
		};
	}

	async function publish({
		key,
		reply,
		sentAt,
		expiresAt,
	}: {
		key: string;
		reply: CheckReply;
		sentAt: number;
		expiresAt: number;
	}): Promise<void> {
		if (!shared) return;
		const ttlMs = Math.floor(expiresAt - now());
		if (ttlMs <= 0) return;
		try {
			await shared.write({
				key: SHARED_KEY_PREFIX + key,
				value: JSON.stringify({ sentAt, reply } satisfies SharedLease),
				ttlMs,
			});
		} catch {
			counters.leaseSharedErrors++;
		}
	}

	function holdOwnerReply({
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
		// The owner's clock bounds the answer's age; ours bounds it if the clocks disagree.
		const expiresAt = Math.min(
			reply.lease?.expiresAt ?? Number.NEGATIVE_INFINITY,
			sentAt + maxTtlMs,
		);
		const lease = leaseOf({ command, reply, sentAt, expiresAt });
		if (!holdLease({ key, lease })) {
			counters.leaseWithheld++;
			return;
		}
		counters.leaseIssued++;
		void publish({ key, reply, sentAt, expiresAt });
	}

	/** Another server's lease for this key, held here until the same deadline; null on a miss or a store failure. */
	async function readShared({
		key,
		command,
	}: {
		key: string;
		command: CheckCommand;
	}): Promise<CheckReply | null> {
		if (!shared) return null;
		const readAt = now();
		let found: { value: string; ttlMs: number } | null;
		try {
			found = await shared.read({ key: SHARED_KEY_PREFIX + key });
		} catch {
			counters.leaseSharedErrors++;
			return null;
		}
		if (!found || found.ttlMs <= 0) return null;
		const { sentAt, reply } = JSON.parse(found.value) as SharedLease;
		if (!reply.result.allowed) return null;
		// Asked before a write this server sent (or within clock skew of it): the owner may have answered without it.
		const lease = leaseOf({
			command,
			reply,
			sentAt: sentAt - SHARED_CLOCK_SKEW_MS,
			expiresAt: readAt + Math.min(found.ttlMs, maxTtlMs),
		});
		return holdLease({ key, lease }) ? reply : null;
	}

	async function answer({
		command,
		send,
	}: {
		command: CheckCommand;
		send: () => Promise<CheckReply>;
	}): Promise<CheckReply> {
		const key = leaseKeyOf({ command });
		if (key !== null) {
			const local = readHeld({ key });
			if (local) {
				counters.leaseHit++;
				return local;
			}
			const fromShared = await readShared({ key, command });
			if (fromShared) {
				counters.leaseSharedHit++;
				return fromShared;
			}
		}
		counters.leaseMiss++;
		const sentAt = now();
		const reply = await send();
		if (key !== null) holdOwnerReply({ key, command, reply, sentAt });
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
