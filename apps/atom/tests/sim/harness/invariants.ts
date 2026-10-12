import { expect } from "bun:test";
import { type SimCluster, subjectKey, type Version } from "./simCluster.js";

const PUSH_PATHS = new Set(["/v1/subjects.set", "/v1/catalog.set"]);

/**
 * Every replica up at the end holds, for every customer, the newest version any of them holds, and the newest catalog.
 * With `pushedWithinMs`, only customers pushed that recently must be held everywhere: the others may have been dropped
 * for a replica's share, which is a cache miss, not a lost update. A replica holding an older version is never allowed.
 */
export const assertConverged = async ({
	cluster,
	pushedWithinMs,
}: {
	cluster: SimCluster;
	pushedWithinMs?: number;
}) => {
	const replicas = cluster.alive();
	expect(replicas.length).toBeGreaterThan(0);
	const held = await Promise.all(
		replicas.map(async (replica) => ({
			replica,
			held: await cluster.held(replica),
		})),
	);
	const truth = new Map<string, Version>();
	for (const { held: byCustomer } of held)
		for (const [customerId, { version }] of byCustomer) {
			const known = truth.get(customerId);
			if (!known || cluster.newer(version, known))
				truth.set(customerId, version);
		}
	const lastPushedAt = new Map<string, number>();
	for (const entry of cluster.applied)
		lastPushedAt.set(
			subjectKey(entry),
			Math.max(lastPushedAt.get(subjectKey(entry)) ?? 0, entry.at),
		);
	const mustBeHeld = (key: string) =>
		pushedWithinMs === undefined ||
		(lastPushedAt.get(key) ?? 0) >= cluster.clock.now() - pushedWithinMs;
	for (const entry of cluster.applied) {
		if (cluster.lostVolumes.has(entry.on) || !mustBeHeld(subjectKey(entry)))
			continue;
		const known = truth.get(subjectKey(entry));
		if (!known || cluster.newer(entry.version, known))
			throw new Error(
				`${subjectKey(entry)}@${entry.balance} applied at +${entry.at - 1_700_000_000_000}ms on #${entry.on} is held by no replica now: a lost update`,
			);
	}
	for (const { replica, held: byCustomer } of held)
		for (const [customerId, version] of truth) {
			const mine = byCustomer.get(customerId);
			if (!mine && !mustBeHeld(customerId)) continue;
			if (!mine || cluster.newer(version, mine.version))
				throw new Error(
					`${replica.address}#${replica.id} holds ${customerId} at ${mine ? `${mine.version.readAt}/${mine.version.logOffset}` : "nothing"}, newest is ${version.readAt}/${version.logOffset}`,
				);
		}
	// The same version means the same rows: a part written empty at a version it already held would pass the version check alone.
	for (const [key, version] of truth) {
		const balances = new Set(
			held
				.map(({ held: byCustomer }) => byCustomer.get(key))
				.filter((mine) => mine && !cluster.newer(version, mine.version))
				.map((mine) => mine?.balance),
		);
		if (balances.size !== 1 || balances.has(Number.NaN))
			throw new Error(
				`${key} at ${version.readAt}/${version.logOffset} holds different rows across replicas: balances ${[...balances].join(", ")}`,
			);
	}
	const catalogReadAt = cluster.catalogReadAt();
	if (catalogReadAt > 0)
		// False only when a catalog read at or after this one is held.
		for (const replica of replicas)
			expect(
				replica.slots.installCatalog({ rows: [], readAt: catalogReadAt - 1 }),
			).toBe(false);
};

/** A check a ready replica answered never shows a balance older than what any replica had applied `boundMs` before. */
export const assertFreshness = ({
	cluster,
	boundMs,
}: {
	cluster: SimCluster;
	boundMs: number;
}) => {
	for (const check of cluster.checks) {
		if (
			check.status !== 200 ||
			!check.answeredByReady ||
			check.balance === undefined
		)
			continue;
		const own = cluster.applied.filter(
			(entry) =>
				entry.customerId === check.customerId && entry.entityId === null,
		);
		let newest: (typeof own)[number] | undefined;
		for (const entry of own)
			if (
				entry.at <= check.at - boundMs &&
				(!newest || cluster.newer(entry.version, newest.version))
			)
				newest = entry;
		if (!newest) continue;
		// The answer must come from that write or a later one, whatever balance those carried. A push whose reply timed
		// out was stored unseen: a balance no entry carries counts when it is newer than the newest known (or a plan end's 0).
		const known = own.filter((entry) => entry.balance === check.balance);
		const current =
			known.length > 0
				? known.some((entry) => !cluster.newer(newest.version, entry.version))
				: check.balance > newest.balance || check.balance === 0;
		if (!current)
			throw new Error(
				`check of ${check.customerId} on ${check.to} at +${check.at - 1_700_000_000_000}ms answered balance ${check.balance}; ${newest.balance} was applied over ${boundMs}ms earlier${check.proxied ? " (proxied)" : ""}`,
			);
	}
};

/** A relay only ever carries what its sender took from Autumn, and a proxied check is answered where it lands. */
export const assertNoLoops = ({ cluster }: { cluster: SimCluster }) => {
	const fromAutumn = new Map<number, Set<string>>();
	for (const record of cluster.network.observed) {
		if (
			record.from !== 0 ||
			!PUSH_PATHS.has(record.path) ||
			record.toId === undefined
		)
			continue;
		const bodies = fromAutumn.get(record.toId) ?? new Set<string>();
		fromAutumn.set(record.toId, bodies);
		bodies.add(record.body);
	}
	for (const record of cluster.network.observed) {
		if (record.path.startsWith("/v1/_peer/")) continue;
		// A row sent again after a restart is what the sender's own file holds, whoever first relayed it; bounded by the resend window.
		if (
			record.relayed &&
			!record.resend &&
			!fromAutumn.get(record.from)?.has(record.body)
		)
			throw new Error(
				`replica #${record.from} relayed to ${record.to} a body it did not take from Autumn: a relay of a relay`,
			);
		if (record.proxied && record.replyProxied)
			throw new Error(
				`a check proxied from #${record.from} to ${record.to} was proxied again`,
			);
	}
};

export const assertNoErrors = ({
	cluster,
	allowPeerTimeouts,
}: {
	cluster: SimCluster;
	allowPeerTimeouts: boolean;
}) => {
	const failed = cluster.checks.filter(
		(check) =>
			check.status === "ERR" ||
			(typeof check.status === "number" &&
				check.status >= 500 &&
				!(allowPeerTimeouts && check.status === 504)),
	);
	const first = failed[0];
	if (first)
		throw new Error(
			`${failed.length} checks failed, first at +${first.at - 1_700_000_000_000}ms to ${first.to}: ${first.status}`,
		);
};
