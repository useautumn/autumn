import { expect } from "bun:test";
import { type SimCluster, subjectKey, type Version } from "./simCluster.js";

const PUSH_PATHS = new Set(["/v1/subjects.set", "/v1/catalog.set"]);

/** Every replica up at the end holds, for every customer, the newest version any of them holds, and the newest catalog. */
export const assertConverged = async ({ cluster }: { cluster: SimCluster }) => {
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
	for (const entry of cluster.applied) {
		if (cluster.lostVolumes.has(entry.on)) continue;
		const known = truth.get(subjectKey(entry));
		if (!known || cluster.newer(entry.version, known))
			throw new Error(
				`${subjectKey(entry)}@${entry.balance} applied at +${entry.at - 1_700_000_000_000}ms on #${entry.on} is held by no replica now: a lost update`,
			);
	}
	for (const { replica, held: byCustomer } of held)
		for (const [customerId, version] of truth) {
			const mine = byCustomer.get(customerId);
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
		let newest = 0;
		for (const entry of cluster.applied)
			if (
				entry.customerId === check.customerId &&
				entry.entityId === null &&
				entry.at <= check.at - boundMs &&
				entry.balance > newest
			)
				newest = entry.balance;
		if (check.balance < newest)
			throw new Error(
				`check of ${check.customerId} on ${check.to} at +${check.at - 1_700_000_000_000}ms answered balance ${check.balance}; ${newest} was applied over ${boundMs}ms earlier${check.proxied ? " (proxied)" : ""}`,
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
		let bodies = fromAutumn.get(record.toId);
		if (!bodies) fromAutumn.set(record.toId, (bodies = new Set()));
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
	if (failed.length > 0)
		throw new Error(
			`${failed.length} checks failed, first at +${failed[0]!.at - 1_700_000_000_000}ms to ${failed[0]!.to}: ${failed[0]!.status}`,
		);
};
