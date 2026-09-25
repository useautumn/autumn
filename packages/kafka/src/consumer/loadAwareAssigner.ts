import { AssignerProtocol, type PartitionAssigner } from "kafkajs";

const ASSIGNER_NAME = "LoadAwareCoPartitionedAssigner";
const ASSIGNER_VERSION = 1;
const USER_DATA_VERSION = 2;
/**
 * A move has to leave both members it touches this far under the source's
 * load, or it is churn: splitting a hot pair halves the source, shuffling a
 * light partition off it gains a few percent and rehydrates a customer.
 */
const MIN_IMPROVEMENT = 0.2;
/** Only a member carrying this many times the mean load is relieved: the rest is unevenness, not a hot pair. */
const RELIEF_LOAD_RATIO = 1.25;
/** A membership change moves the leaver's partitions and at most this many more, so a rebalance stays a small event. */
const MAX_RELIEF_MOVES = 4;

/** What a member knows about the recent cost of the partitions it has served, and which it serves now. */
export type PartitionLoadSource = {
	snapshot(): ReadonlyMap<number, number>;
	/** The partitions this member serves right now; absent, the ones it reports weight for stand in. */
	owned?(): ReadonlySet<number>;
};

export type WeightedPartition = {
	partition: number;
	weight: number;
	/** The member serving it now, when one still is. */
	owner?: string;
};

type Cluster = Parameters<PartitionAssigner>[0]["cluster"];
type GroupMember = { memberId: string; memberMetadata: Buffer };
type MemberReport = { weights: Map<number, number>; owned: Set<number> };

/**
 * Partition n of every subscribed topic still lands on one member, but the
 * leader places partitions by recent cost instead of by number, and keeps
 * them where they are unless moving one is what balance requires.
 *
 * Each member sends, in its join metadata, the weight of the partitions it
 * has served and the set it serves now. The leader keeps every partition on
 * its current member (shedding a member's lightest ones only when the count
 * cap of ceil(P / N) shrank under it), deals the ownerless ones heaviest
 * first to whoever carries least, then moves or swaps single partitions off
 * the heaviest members while a move still takes the members it touches
 * clearly under that member's load. Dealing every partition from scratch on
 * each membership change moved 63 of 64 partitions for one dropped member
 * and rehydrated every customer at once; this moves the few that matter.
 * With no history at all this is an even count per member, by number.
 */
export function createLoadAwareAssigner({
	loads,
}: {
	loads: PartitionLoadSource;
}): PartitionAssigner {
	function loadAwareAssigner({
		cluster,
		logger,
	}: Parameters<PartitionAssigner>[0]): ReturnType<PartitionAssigner> {
		async function assign({
			members,
			topics,
		}: {
			members: GroupMember[];
			topics: string[];
		}) {
			const partitionsByTopic = partitionsByTopicOf({ cluster, topics });
			const partitions = unionOf({ partitionsByTopic });
			const memberIds = members.map(memberIdOf).sort();
			const reports = reportsOf({ members });
			const reported = reportedWeightsOf({ reports });
			const owners = ownersOf({ reports, memberIds });
			const weighted = weigh({ partitions, reported, owners });
			const dealt = balancePartitions({ partitions: weighted, memberIds });
			logger.info("Load-aware partition assignment", {
				reportedPartitions: reported.size,
				...movementOf({ dealt, weighted }),
				members: summarize({ dealt, weighted }),
			});
			const encoded = [];
			for (const [memberId, owned] of dealt) {
				const byTopic: Record<string, number[]> = {};
				for (const topic of topics) {
					const present = partitionsByTopic.get(topic) ?? new Set<number>();
					const assigned: number[] = [];
					for (const partition of owned) {
						if (present.has(partition)) assigned.push(partition);
					}
					byTopic[topic] = assigned;
				}
				encoded.push({
					memberId,
					memberAssignment: AssignerProtocol.MemberAssignment.encode({
						version: ASSIGNER_VERSION,
						assignment: byTopic,
						userData: Buffer.alloc(0),
					}),
				});
			}
			return encoded;
		}

		function protocol({ topics }: { topics: string[] }) {
			return {
				name: ASSIGNER_NAME,
				metadata: AssignerProtocol.MemberMetadata.encode({
					version: ASSIGNER_VERSION,
					topics,
					userData: encodeUserData({
						weights: loads.snapshot(),
						owned: loads.owned?.(),
					}),
				}),
			};
		}

		return { name: ASSIGNER_NAME, version: ASSIGNER_VERSION, assign, protocol };
	}
	return loadAwareAssigner;
}

/**
 * Sticky first: a partition stays with its owner while the owner is a member
 * with room under the cap of ceil(P / N); heaviest first, so a member over
 * the cap sheds its lightest. Ownerless partitions go heaviest first to the
 * member carrying the least (ties to fewer partitions, then the lower id).
 * Then, from the heaviest member down, one partition moves to another member
 * with room, or swaps with a lighter one there, when that leaves both members
 * at least MIN_IMPROVEMENT under the source's load; the move that leaves the
 * lowest peak wins, a plain move beating a swap. Repeats until nothing improves.
 */
export function balancePartitions({
	partitions,
	memberIds,
}: {
	partitions: readonly WeightedPartition[];
	memberIds: readonly string[];
}): Map<string, number[]> {
	const dealt = new Map<string, number[]>();
	if (memberIds.length === 0) return dealt;
	const totals = new Map<string, number>();
	for (const memberId of memberIds) {
		dealt.set(memberId, []);
		totals.set(memberId, 0);
	}
	const capacity = Math.ceil(partitions.length / memberIds.length);
	const weightOf = new Map<number, number>();
	const ordered = [...partitions].sort(heaviestFirst);
	const pending: WeightedPartition[] = [];
	for (const entry of ordered) {
		weightOf.set(entry.partition, entry.weight);
		const owned =
			entry.owner === undefined ? undefined : dealt.get(entry.owner);
		if (owned === undefined || owned.length >= capacity) {
			pending.push(entry);
			continue;
		}
		place({ memberId: entry.owner as string, entry, dealt, totals });
	}
	for (const entry of pending) {
		let chosen: string | undefined;
		for (const memberId of memberIds) {
			if ((dealt.get(memberId)?.length ?? 0) >= capacity) continue;
			if (
				chosen === undefined ||
				carriesLess({ memberId, than: chosen, totals, dealt })
			) {
				chosen = memberId;
			}
		}
		if (chosen === undefined) {
			throw new Error(
				"Every member is at capacity before all partitions were dealt",
			);
		}
		place({ memberId: chosen, entry, dealt, totals });
	}
	relieve({ memberIds, dealt, totals, weightOf, capacity });
	evenOutCounts({ memberIds, dealt, totals, weightOf });
	for (const owned of dealt.values()) owned.sort(ascending);
	return dealt;
}

/**
 * Load relief never moves a partition nobody has weighed, so a cold fleet
 * that grew would keep every partition on the first members and leave the
 * newcomers idle. While one member holds two more than another, its lightest
 * partition moves to the emptiest member, unless that would make the
 * emptiest member the heaviest.
 */
function evenOutCounts({
	memberIds,
	dealt,
	totals,
	weightOf,
}: {
	memberIds: readonly string[];
	dealt: Map<string, number[]>;
	totals: Map<string, number>;
	weightOf: ReadonlyMap<number, number>;
}): void {
	function fullestFirst(a: string, b: string): number {
		const difference =
			(dealt.get(b)?.length ?? 0) - (dealt.get(a)?.length ?? 0);
		if (difference !== 0) return difference;
		const byLoad = (totals.get(b) ?? 0) - (totals.get(a) ?? 0);
		return byLoad !== 0 ? byLoad : a.localeCompare(b);
	}
	function emptiestFirst(a: string, b: string): number {
		const difference =
			(dealt.get(a)?.length ?? 0) - (dealt.get(b)?.length ?? 0);
		if (difference !== 0) return difference;
		const byLoad = (totals.get(a) ?? 0) - (totals.get(b) ?? 0);
		return byLoad !== 0 ? byLoad : a.localeCompare(b);
	}
	function lightestFirst(a: number, b: number): number {
		const difference = (weightOf.get(a) ?? 0) - (weightOf.get(b) ?? 0);
		return difference !== 0 ? difference : a - b;
	}
	for (let round = 0; round < weightOf.size; round++) {
		const source = [...memberIds].sort(fullestFirst)[0];
		const target = [...memberIds].sort(emptiestFirst)[0];
		if (source === undefined || target === undefined) return;
		const sourceOwned = dealt.get(source) ?? [];
		const targetOwned = dealt.get(target) ?? [];
		if (sourceOwned.length - targetOwned.length < 2) return;
		const partition = [...sourceOwned].sort(lightestFirst)[0];
		if (partition === undefined) return;
		const weight = weightOf.get(partition) ?? 0;
		const targetAfter = (totals.get(target) ?? 0) + weight;
		let heaviestElsewhere = 0;
		for (const memberId of memberIds) {
			if (memberId === target) continue;
			heaviestElsewhere = Math.max(
				heaviestElsewhere,
				totals.get(memberId) ?? 0,
			);
		}
		if (targetAfter > heaviestElsewhere) return;
		apply({
			relief: { source, target, partition, peak: targetAfter },
			dealt,
			totals,
			weightOf,
		});
	}
}

function place({
	memberId,
	entry,
	dealt,
	totals,
}: {
	memberId: string;
	entry: WeightedPartition;
	dealt: Map<string, number[]>;
	totals: Map<string, number>;
}): void {
	dealt.get(memberId)?.push(entry.partition);
	totals.set(memberId, (totals.get(memberId) ?? 0) + entry.weight);
}

type Relief = {
	source: string;
	target: string;
	partition: number;
	/** The target's partition that comes back, for a swap. */
	inExchange?: number;
	peak: number;
};

/** Moves single partitions off members carrying well over the mean, a few per rebalance, while a move still clearly lowers what they carry. */
function relieve({
	memberIds,
	dealt,
	totals,
	weightOf,
	capacity,
}: {
	memberIds: readonly string[];
	dealt: Map<string, number[]>;
	totals: Map<string, number>;
	weightOf: ReadonlyMap<number, number>;
	capacity: number;
}): void {
	function heaviestMemberFirst(a: string, b: string): number {
		const difference = (totals.get(b) ?? 0) - (totals.get(a) ?? 0);
		return difference !== 0 ? difference : a.localeCompare(b);
	}
	let total = 0;
	for (const memberId of memberIds) total += totals.get(memberId) ?? 0;
	const threshold = (total / memberIds.length) * RELIEF_LOAD_RATIO;
	function carriesWellOverMean(memberId: string): boolean {
		return (totals.get(memberId) ?? 0) > threshold;
	}
	for (let round = 0; round < MAX_RELIEF_MOVES; round++) {
		const sources = [...memberIds]
			.sort(heaviestMemberFirst)
			.filter(carriesWellOverMean);
		let relief: Relief | undefined;
		for (const source of sources) {
			relief = bestReliefFrom({
				source,
				memberIds,
				dealt,
				totals,
				weightOf,
				capacity,
			});
			if (relief) break;
		}
		if (!relief) return;
		apply({ relief, dealt, totals, weightOf });
	}
}

function bestReliefFrom({
	source,
	memberIds,
	dealt,
	totals,
	weightOf,
	capacity,
}: {
	source: string;
	memberIds: readonly string[];
	dealt: ReadonlyMap<string, number[]>;
	totals: ReadonlyMap<string, number>;
	weightOf: ReadonlyMap<number, number>;
	capacity: number;
}): Relief | undefined {
	const sourceLoad = totals.get(source) ?? 0;
	if (sourceLoad <= 0) return undefined;
	const limit = sourceLoad * (1 - MIN_IMPROVEMENT);
	let best: Relief | undefined;
	function consider(candidate: Relief, sourceAfter: number): void {
		if (sourceAfter >= sourceLoad) return;
		if (candidate.peak > limit) return;
		if (best && !betterRelief(candidate, best)) return;
		best = candidate;
	}
	for (const partition of dealt.get(source) ?? []) {
		const weight = weightOf.get(partition) ?? 0;
		for (const target of memberIds) {
			if (target === source) continue;
			const targetLoad = totals.get(target) ?? 0;
			const targetOwned = dealt.get(target) ?? [];
			if (targetOwned.length < capacity) {
				const sourceAfter = sourceLoad - weight;
				const targetAfter = targetLoad + weight;
				consider(
					{
						source,
						target,
						partition,
						peak: Math.max(sourceAfter, targetAfter),
					},
					sourceAfter,
				);
			}
			for (const inExchange of targetOwned) {
				const back = weightOf.get(inExchange) ?? 0;
				if (back >= weight) continue;
				const sourceAfter = sourceLoad - weight + back;
				const targetAfter = targetLoad + weight - back;
				consider(
					{
						source,
						target,
						partition,
						inExchange,
						peak: Math.max(sourceAfter, targetAfter),
					},
					sourceAfter,
				);
			}
		}
	}
	return best;
}

/** Lower peak first; then a plain move over a swap; then the lower partition, then the lower target id. */
function betterRelief(candidate: Relief, current: Relief): boolean {
	if (candidate.peak !== current.peak) return candidate.peak < current.peak;
	const candidateMoves = candidate.inExchange === undefined ? 1 : 2;
	const currentMoves = current.inExchange === undefined ? 1 : 2;
	if (candidateMoves !== currentMoves) return candidateMoves < currentMoves;
	if (candidate.partition !== current.partition)
		return candidate.partition < current.partition;
	return candidate.target.localeCompare(current.target) < 0;
}

function apply({
	relief,
	dealt,
	totals,
	weightOf,
}: {
	relief: Relief;
	dealt: Map<string, number[]>;
	totals: Map<string, number>;
	weightOf: ReadonlyMap<number, number>;
}): void {
	const { source, target, partition, inExchange } = relief;
	const sourceOwned = dealt.get(source) ?? [];
	const targetOwned = dealt.get(target) ?? [];
	sourceOwned.splice(sourceOwned.indexOf(partition), 1);
	targetOwned.push(partition);
	let delta = weightOf.get(partition) ?? 0;
	if (inExchange !== undefined) {
		targetOwned.splice(targetOwned.indexOf(inExchange), 1);
		sourceOwned.push(inExchange);
		delta -= weightOf.get(inExchange) ?? 0;
	}
	totals.set(source, (totals.get(source) ?? 0) - delta);
	totals.set(target, (totals.get(target) ?? 0) + delta);
}

function carriesLess({
	memberId,
	than,
	totals,
	dealt,
}: {
	memberId: string;
	than: string;
	totals: ReadonlyMap<string, number>;
	dealt: ReadonlyMap<string, number[]>;
}): boolean {
	const candidate = totals.get(memberId) ?? 0;
	const current = totals.get(than) ?? 0;
	if (candidate !== current) return candidate < current;
	return (dealt.get(memberId)?.length ?? 0) < (dealt.get(than)?.length ?? 0);
}

function heaviestFirst(a: WeightedPartition, b: WeightedPartition): number {
	if (a.weight !== b.weight) return b.weight - a.weight;
	return a.partition - b.partition;
}

function ascending(a: number, b: number): number {
	return a - b;
}

function memberIdOf({ memberId }: { memberId: string }): string {
	return memberId;
}

function partitionsByTopicOf({
	cluster,
	topics,
}: {
	cluster: Cluster;
	topics: string[];
}): Map<string, Set<number>> {
	const byTopic = new Map<string, Set<number>>();
	for (const topic of topics) {
		const partitions = new Set<number>();
		for (const { partitionId } of cluster.findTopicPartitionMetadata(topic)) {
			partitions.add(partitionId);
		}
		byTopic.set(topic, partitions);
	}
	return byTopic;
}

function unionOf({
	partitionsByTopic,
}: {
	partitionsByTopic: ReadonlyMap<string, ReadonlySet<number>>;
}): number[] {
	const union = new Set<number>();
	for (const partitions of partitionsByTopic.values()) {
		for (const partition of partitions) union.add(partition);
	}
	return [...union].sort(ascending);
}

function reportsOf({
	members,
}: {
	members: readonly GroupMember[];
}): Map<string, MemberReport> {
	const reports = new Map<string, MemberReport>();
	for (const member of members) {
		reports.set(member.memberId, decodeUserData(member.memberMetadata));
	}
	return reports;
}

/** The highest weight any member reports for a partition; a former owner's stale report only decays. */
function reportedWeightsOf({
	reports,
}: {
	reports: ReadonlyMap<string, MemberReport>;
}): Map<number, number> {
	const weights = new Map<number, number>();
	for (const { weights: reported } of reports.values()) {
		for (const [partition, weight] of reported) {
			weights.set(partition, Math.max(weights.get(partition) ?? 0, weight));
		}
	}
	return weights;
}

/** Who serves each partition now: of the members claiming it, the one that has done the most on it, then the lower id. */
function ownersOf({
	reports,
	memberIds,
}: {
	reports: ReadonlyMap<string, MemberReport>;
	memberIds: readonly string[];
}): Map<number, string> {
	const owners = new Map<number, string>();
	const claimed = new Map<number, number>();
	for (const memberId of memberIds) {
		const report = reports.get(memberId);
		if (!report) continue;
		for (const partition of report.owned) {
			const weight = report.weights.get(partition) ?? 0;
			const current = claimed.get(partition);
			if (current === undefined || weight > current) {
				claimed.set(partition, weight);
				owners.set(partition, memberId);
			}
		}
	}
	return owners;
}

/** Unknown partitions take the median known weight, or 1 when nobody has reported anything. */
function weigh({
	partitions,
	reported,
	owners,
}: {
	partitions: readonly number[];
	reported: ReadonlyMap<number, number>;
	owners: ReadonlyMap<number, string>;
}): WeightedPartition[] {
	const known: number[] = [];
	for (const partition of partitions) {
		const weight = reported.get(partition);
		if (weight !== undefined) known.push(weight);
	}
	const fallback = known.length > 0 ? medianOf(known) : 1;
	const weighted: WeightedPartition[] = [];
	for (const partition of partitions) {
		const owner = owners.get(partition);
		weighted.push({
			partition,
			weight: reported.get(partition) ?? (owner === undefined ? fallback : 0),
			...(owner === undefined ? {} : { owner }),
		});
	}
	return weighted;
}

function medianOf(values: readonly number[]): number {
	const sorted = [...values].sort(ascending);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
	return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Owned partitions are always reported, at 0 when nothing has been committed on them yet, so the leader never guesses their weight. */
function encodeUserData({
	weights,
	owned,
}: {
	weights: ReadonlyMap<number, number>;
	owned: ReadonlySet<number> | undefined;
}): Buffer {
	const entries: [number, number][] = [];
	for (const [partition, weight] of weights) {
		if (Number.isFinite(weight) && weight > 0) {
			entries.push([partition, Math.round(weight)]);
		}
	}
	if (owned) {
		const reported = new Set<number>();
		for (const [partition] of entries) reported.add(partition);
		for (const partition of owned) {
			if (!reported.has(partition)) entries.push([partition, 0]);
		}
	}
	entries.sort(byPartition);
	const userData: {
		version: number;
		weights: [number, number][];
		owned?: number[];
	} = { version: USER_DATA_VERSION, weights: entries };
	if (owned) userData.owned = [...owned].sort(ascending);
	return Buffer.from(JSON.stringify(userData), "utf8");
}

function byPartition(a: [number, number], b: [number, number]): number {
	return a[0] - b[0];
}

/**
 * A member that sends nothing, or something this version cannot read, reports
 * no weights and owns nothing. A report without an owned set (version 1)
 * owns what it reports a positive weight for.
 */
function decodeUserData(memberMetadata: Buffer): MemberReport {
	const empty: MemberReport = { weights: new Map(), owned: new Set() };
	let userData: Buffer | undefined;
	try {
		userData = AssignerProtocol.MemberMetadata.decode(memberMetadata)?.userData;
	} catch {
		return empty;
	}
	if (!userData || userData.length === 0) return empty;
	let parsed: unknown;
	try {
		parsed = JSON.parse(userData.toString("utf8"));
	} catch {
		return empty;
	}
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		!("weights" in parsed) ||
		!Array.isArray(parsed.weights)
	) {
		return empty;
	}
	const weights = new Map<number, number>();
	for (const entry of parsed.weights) {
		if (!Array.isArray(entry) || entry.length !== 2) continue;
		const [partition, weight] = entry;
		if (
			Number.isSafeInteger(partition) &&
			partition >= 0 &&
			typeof weight === "number" &&
			Number.isFinite(weight) &&
			weight >= 0
		) {
			weights.set(partition, weight);
		}
	}
	const owned = new Set<number>();
	if ("owned" in parsed && Array.isArray(parsed.owned)) {
		for (const partition of parsed.owned) {
			if (Number.isSafeInteger(partition) && partition >= 0)
				owned.add(partition);
		}
	} else {
		for (const [partition, weight] of weights) {
			if (weight > 0) owned.add(partition);
		}
	}
	return { weights, owned };
}

function movementOf({
	dealt,
	weighted,
}: {
	dealt: ReadonlyMap<string, number[]>;
	weighted: readonly WeightedPartition[];
}): { kept: number; moved: number; placed: number } {
	const dealtTo = new Map<number, string>();
	for (const [memberId, partitions] of dealt) {
		for (const partition of partitions) dealtTo.set(partition, memberId);
	}
	let kept = 0;
	let moved = 0;
	let placed = 0;
	for (const { partition, owner } of weighted) {
		if (owner === undefined) placed++;
		else if (dealtTo.get(partition) === owner) kept++;
		else moved++;
	}
	return { kept, moved, placed };
}

function summarize({
	dealt,
	weighted,
}: {
	dealt: ReadonlyMap<string, number[]>;
	weighted: readonly WeightedPartition[];
}): { memberId: string; partitions: number[]; weight: number }[] {
	const weightOf = new Map<number, number>();
	for (const { partition, weight } of weighted) weightOf.set(partition, weight);
	const summary = [];
	for (const [memberId, partitions] of dealt) {
		let weight = 0;
		for (const partition of partitions) weight += weightOf.get(partition) ?? 0;
		summary.push({ memberId, partitions, weight: Math.round(weight) });
	}
	return summary;
}
