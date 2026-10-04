import type {
	Catalog,
	SubjectState,
	TrackCommand,
} from "@autumn/balance-engine";
import type { TrackReply } from "../contracts/track.js";
import type {
	TrackGrantCounters,
	TrackGrants,
	TrackGrantsConfig,
} from "./types/trackGrants.js";

const DEFAULT_MAX_TTL_MS = 1_000;

type HeldGrant = {
	leaseId: string;
	remaining: number;
	expiresAt: number;
	state: SubjectState;
	catalog: Catalog;
};

/** The owner grants only these, so only these can be answered from a grant: refunds, locks, entities and properties go to it. */
function grantKeyOf({ command }: { command: TrackCommand }): string | null {
	if (
		command.value <= 0 ||
		command.lock !== undefined ||
		command.idempotency !== undefined ||
		command.enforceOverdueBlock !== undefined ||
		command.leaseId !== undefined ||
		command.identity.entityId ||
		(command.properties !== null && Object.keys(command.properties).length > 0)
	)
		return null;
	const { identity } = command;
	return JSON.stringify([
		identity.orgId,
		identity.env,
		identity.customerId,
		command.featureId,
		command.internalFeatureId,
		command.org.config,
	]);
}

/** Owner-granted track units held on this server: a bounded LRU, each until its grant or `maxTtlMs` lapses. */
export function createTrackGrants({
	ctx = {},
	config,
}: {
	ctx?: { now?: () => number };
	config: TrackGrantsConfig;
}): TrackGrants {
	const now = ctx.now ?? Date.now;
	const maxTtlMs = config.maxTtlMs ?? DEFAULT_MAX_TTL_MS;
	const held = new Map<string, HeldGrant>();
	const counters: Omit<TrackGrantCounters, "size"> = {
		grantHit: 0,
		grantMiss: 0,
		grantIssued: 0,
		grantDropped: 0,
	};

	function read({ key }: { key: string }): HeldGrant | null {
		const grant = held.get(key);
		if (!grant) return null;
		held.delete(key);
		if (now() >= grant.expiresAt) return null;
		held.set(key, grant);
		return grant;
	}

	function hold({
		key,
		command,
		reply,
		sentAt,
	}: {
		key: string;
		command: TrackCommand;
		reply: TrackReply;
		sentAt: number;
	}): void {
		const { grant } = reply;
		if (!grant) return;
		counters.grantIssued++;
		held.delete(key);
		held.set(key, {
			leaseId: grant.leaseId,
			remaining: grant.units,
			// The owner's clock bounds the grant's age; ours bounds it if the clocks disagree.
			expiresAt:
				sentAt + Math.min(grant.expiresAt - command.occurredAt, maxTtlMs),
			state: reply.state,
			catalog: reply.catalog,
		});
		if (held.size <= config.maxEntries) return;
		const oldest = held.keys().next().value;
		if (oldest === undefined) return;
		held.delete(oldest);
		counters.grantDropped++;
	}

	async function answer({
		command,
		send,
		append,
	}: {
		command: TrackCommand;
		send: () => Promise<TrackReply>;
		append: (command: TrackCommand) => Promise<void>;
	}): Promise<TrackReply> {
		const key = grantKeyOf({ command });
		if (key === null) return send();
		const grant = read({ key });
		const local =
			grant && command.value <= grant.remaining
				? config.decide({ state: grant.state, catalog: grant.catalog, command })
				: null;
		if (grant && local) {
			grant.remaining -= command.value;
			grant.state = local.state;
			// Queued before the answer: a track answered here always reaches the owner's ledger. Overflow, because it was promised.
			try {
				await append({
					...command,
					leaseId: grant.leaseId,
					overageBehavior: "overflow",
				});
			} catch (cause) {
				if (held.get(key) === grant) {
					held.delete(key);
					counters.grantDropped++;
				}
				throw cause;
			}
			counters.grantHit++;
			return {
				result: local.result,
				changes: local.changes,
				state: local.state,
				catalog: grant.catalog,
				effects: [],
				approximate: true,
			};
		}
		counters.grantMiss++;
		const sentAt = now();
		const reply = await send();
		hold({ key, command, reply, sentAt });
		return reply;
	}

	function readCounters(): TrackGrantCounters {
		return { ...counters, size: held.size };
	}

	return { answer, readCounters };
}
