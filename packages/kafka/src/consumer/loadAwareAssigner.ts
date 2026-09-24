import { AssignerProtocol, type PartitionAssigner } from "kafkajs";

const ASSIGNER_NAME = "LoadAwareCoPartitionedAssigner";
const ASSIGNER_VERSION = 1;
const USER_DATA_VERSION = 1;

/** What a member knows about the recent cost of the partitions it has served. */
export type PartitionLoadSource = {
	snapshot(): ReadonlyMap<number, number>;
};

export type WeightedPartition = { partition: number; weight: number };

type Cluster = Parameters<PartitionAssigner>[0]["cluster"];
type GroupMember = { memberId: string; memberMetadata: Buffer };

/**
 * Partition n of every subscribed topic still lands on one member, but the
 * leader deals partitions by recent cost instead of by number. Round robin
 * gives partition p to member p mod N, so partitions N apart always share a
 * worker whatever they cost; with 64 partitions on 24 workers that put every
 * large-state customer on the same thread, run after run.
 *
 * Each member sends the weight of the partitions it has served in its join
 * metadata. The leader takes the highest report per partition, gives unknown
 * partitions the median known weight, sorts heaviest first and hands each to
 * the member carrying the least, never more than ceil(P / N) each. With no
 * history at all this is an even count per member.
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
			const reported = reportedWeightsOf({ members });
			const weighted = weigh({ partitions, reported });
			const memberIds = members.map(memberIdOf).sort();
			const dealt = balancePartitions({ partitions: weighted, memberIds });
			logger.info("Load-aware partition assignment", {
				reportedPartitions: reported.size,
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
					userData: encodeUserData({ weights: loads.snapshot() }),
				}),
			};
		}

		return { name: ASSIGNER_NAME, version: ASSIGNER_VERSION, assign, protocol };
	}
	return loadAwareAssigner;
}

/**
 * Heaviest partition first, each to the member carrying the least so far;
 * ties go to the member with fewer partitions, then the lower member id.
 * No member takes more than ceil(P / N), so counts stay even as well.
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
	const ordered = [...partitions].sort(heaviestFirst);
	for (const { partition, weight } of ordered) {
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
		dealt.get(chosen)?.push(partition);
		totals.set(chosen, (totals.get(chosen) ?? 0) + weight);
	}
	for (const owned of dealt.values()) owned.sort(ascending);
	return dealt;
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

/** The highest weight any member reports for a partition; a former owner's stale report only decays. */
function reportedWeightsOf({
	members,
}: {
	members: readonly GroupMember[];
}): Map<number, number> {
	const weights = new Map<number, number>();
	for (const member of members) {
		for (const [partition, weight] of decodeUserData(member.memberMetadata)) {
			weights.set(partition, Math.max(weights.get(partition) ?? 0, weight));
		}
	}
	return weights;
}

/** Unknown partitions take the median known weight, or 1 when nobody has reported anything. */
function weigh({
	partitions,
	reported,
}: {
	partitions: readonly number[];
	reported: ReadonlyMap<number, number>;
}): WeightedPartition[] {
	const known: number[] = [];
	for (const partition of partitions) {
		const weight = reported.get(partition);
		if (weight !== undefined) known.push(weight);
	}
	const fallback = known.length > 0 ? medianOf(known) : 1;
	const weighted: WeightedPartition[] = [];
	for (const partition of partitions) {
		weighted.push({ partition, weight: reported.get(partition) ?? fallback });
	}
	return weighted;
}

function medianOf(values: readonly number[]): number {
	const sorted = [...values].sort(ascending);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
	return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function encodeUserData({
	weights,
}: {
	weights: ReadonlyMap<number, number>;
}): Buffer {
	const entries: [number, number][] = [];
	for (const [partition, weight] of weights) {
		if (Number.isFinite(weight) && weight > 0) {
			entries.push([partition, Math.round(weight)]);
		}
	}
	entries.sort(byPartition);
	return Buffer.from(
		JSON.stringify({ version: USER_DATA_VERSION, weights: entries }),
		"utf8",
	);
}

function byPartition(a: [number, number], b: [number, number]): number {
	return a[0] - b[0];
}

/** A member that sends nothing, or something this version cannot read, simply reports no weights. */
function decodeUserData(memberMetadata: Buffer): [number, number][] {
	let userData: Buffer | undefined;
	try {
		userData = AssignerProtocol.MemberMetadata.decode(memberMetadata)?.userData;
	} catch {
		return [];
	}
	if (!userData || userData.length === 0) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(userData.toString("utf8"));
	} catch {
		return [];
	}
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		!("weights" in parsed) ||
		!Array.isArray(parsed.weights)
	) {
		return [];
	}
	const entries: [number, number][] = [];
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
			entries.push([partition, weight]);
		}
	}
	return entries;
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
