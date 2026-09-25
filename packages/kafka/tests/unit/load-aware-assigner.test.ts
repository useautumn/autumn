import { expect, test } from "bun:test";
import {
	AssignerProtocol,
	type Cluster,
	type PartitionAssigner,
} from "kafkajs";
import { balancePartitions, createLoadAwareAssigner } from "../../src/kafka.js";

const partitionCount = 8;
const topics = ["events", "commands"];

function createCluster(): Cluster {
	return {
		findTopicPartitionMetadata: () =>
			Array.from({ length: partitionCount }, (_, partitionId) => ({
				partitionId,
				leader: 0,
				replicas: [0],
				isr: [0],
				partitionErrorCode: 0,
				offlineReplicas: [],
			})),
	} as unknown as Cluster;
}

const quietLogger = {
	info: () => undefined,
	error: () => undefined,
	warn: () => undefined,
	debug: () => undefined,
	namespace: () => quietLogger,
	setLogLevel: () => undefined,
} as unknown as Parameters<PartitionAssigner>[0]["logger"];

function createAssigner(weights: ReadonlyMap<number, number>) {
	return createLoadAwareAssigner({ loads: { snapshot: () => weights } })({
		cluster: createCluster(),
		groupId: "test",
		logger: quietLogger,
	});
}

/** A member's join metadata as another worker would send it, carrying the weights it knows. */
function memberWith(memberId: string, weights: ReadonlyMap<number, number>) {
	return {
		memberId,
		memberMetadata: createAssigner(weights).protocol({ topics }).metadata,
	};
}

/** A member that also says which partitions it serves right now. */
function memberOwning(
	memberId: string,
	owned: readonly number[],
	weights: ReadonlyMap<number, number> = new Map(),
) {
	const assigner = createLoadAwareAssigner({
		loads: { snapshot: () => weights, owned: () => new Set(owned) },
	})({ cluster: createCluster(), groupId: "test", logger: quietLogger });
	return { memberId, memberMetadata: assigner.protocol({ topics }).metadata };
}

async function assignmentsOf(
	assigner: ReturnType<PartitionAssigner>,
	members: { memberId: string; memberMetadata: Buffer }[],
) {
	const encoded = await assigner.assign({ members, topics });
	return new Map(
		encoded.map(({ memberId, memberAssignment }) => [
			memberId,
			AssignerProtocol.MemberAssignment.decode(memberAssignment)?.assignment ??
				{},
		]),
	);
}

test("two heavy partitions that round robin would colocate land on different members", async () => {
	// Partitions 1 and 4 are both 1 mod 3, so p mod N puts them on the same worker.
	const owner = new Map([
		[1, 1_000_000],
		[4, 1_000_000],
		[2, 10],
	]);
	const byMember = await assignmentsOf(createAssigner(new Map()), [
		memberWith("b", owner),
		memberWith("c", new Map([[5, 10]])),
		memberWith("a", new Map()),
	]);
	const ownerOf = new Map<number, string>();
	for (const [memberId, assignment] of byMember) {
		expect(assignment.events).toEqual(assignment.commands);
		expect(assignment.events?.length).toBeLessThanOrEqual(3);
		for (const partition of assignment.events ?? [])
			ownerOf.set(partition, memberId);
	}
	expect([...ownerOf.keys()].sort((a, b) => a - b)).toEqual([
		0, 1, 2, 3, 4, 5, 6, 7,
	]);
	expect(ownerOf.get(1)).not.toBe(ownerOf.get(4));
});

test("with no history every member gets an even share, each partition once", async () => {
	const byMember = await assignmentsOf(createAssigner(new Map()), [
		{ memberId: "b", memberMetadata: Buffer.alloc(0) },
		{ memberId: "c", memberMetadata: Buffer.alloc(0) },
		{ memberId: "a", memberMetadata: Buffer.alloc(0) },
	]);
	const counts = [...byMember.values()].map(
		(assignment) => assignment.events?.length ?? 0,
	);
	expect(counts.sort()).toEqual([2, 3, 3]);
	const all = [...byMember.values()].flatMap(
		(assignment) => assignment.events ?? [],
	);
	expect(all.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
});

test("metadata this version cannot read counts as no report", async () => {
	const garbage = AssignerProtocol.MemberMetadata.encode({
		version: 1,
		topics,
		userData: Buffer.from("not json", "utf8"),
	});
	const byMember = await assignmentsOf(createAssigner(new Map()), [
		{ memberId: "a", memberMetadata: garbage },
		{ memberId: "b", memberMetadata: Buffer.from([1, 2, 3]) },
	]);
	const all = [...byMember.values()].flatMap(
		(assignment) => assignment.events ?? [],
	);
	expect(all.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
});

test("a member's join metadata carries its rounded, positive weights and what it owns", () => {
	const weights = new Map([
		[3, 12.6],
		[1, 0],
		[7, 5],
	]);
	const assigner = createAssigner(weights);
	const { name, metadata } = assigner.protocol({ topics });
	expect(name).toBe("LoadAwareCoPartitionedAssigner");
	const decoded = AssignerProtocol.MemberMetadata.decode(metadata);
	expect(decoded?.topics).toEqual(topics);
	expect(JSON.parse(decoded?.userData.toString("utf8") ?? "")).toEqual({
		version: 2,
		weights: [
			[3, 13],
			[7, 5],
		],
	});

	// An owned partition is reported even before anything was committed on it, at 0.
	const owning = memberOwning("m", [9, 3], weights);
	const decodedOwning = AssignerProtocol.MemberMetadata.decode(
		owning.memberMetadata,
	);
	expect(JSON.parse(decodedOwning?.userData.toString("utf8") ?? "")).toEqual({
		version: 2,
		weights: [
			[3, 13],
			[7, 5],
			[9, 0],
		],
		owned: [3, 9],
	});
});

test("a joining member takes only what balance needs; everything else stays put", async () => {
	const byMember = await assignmentsOf(createAssigner(new Map()), [
		// a carries a hot pair; b one hot partition and a light one.
		memberOwning(
			"a",
			[0, 1],
			new Map([
				[0, 10],
				[1, 10],
			]),
		),
		memberOwning(
			"b",
			[2, 3],
			new Map([
				[2, 10],
				[3, 1],
			]),
		),
		memberOwning(
			"c",
			[4, 5],
			new Map([
				[4, 1],
				[5, 1],
			]),
		),
		memberOwning(
			"d",
			[6, 7],
			new Map([
				[6, 1],
				[7, 1],
			]),
		),
		{ memberId: "e", memberMetadata: Buffer.alloc(0) },
	]);
	const events = (memberId: string) => byMember.get(memberId)?.events;
	// Half of the hot pair moves to the newcomer. b's light partition would only shave a tenth off b, so it stays.
	expect(events("e")).toEqual([0]);
	expect(events("a")).toEqual([1]);
	expect(events("b")).toEqual([2, 3]);
	expect(events("c")).toEqual([4, 5]);
	expect(events("d")).toEqual([6, 7]);
});

test("a leaving member's partitions are dealt out and nobody else's move", async () => {
	const even = (partitions: number[]) =>
		new Map(partitions.map((partition) => [partition, 1]));
	const byMember = await assignmentsOf(createAssigner(new Map()), [
		memberOwning("a", [0, 1], even([0, 1])),
		memberOwning("b", [2, 3], even([2, 3])),
		memberOwning("c", [4, 5], even([4, 5])),
	]);
	const events = (memberId: string) => byMember.get(memberId)?.events;
	expect(events("a")).toEqual([0, 1, 6]);
	expect(events("b")).toEqual([2, 3, 7]);
	expect(events("c")).toEqual([4, 5]);
});

test("balancing deals heaviest first to whoever carries least, within an even count", () => {
	const dealt = balancePartitions({
		partitions: [
			{ partition: 0, weight: 10 },
			{ partition: 1, weight: 9 },
			{ partition: 2, weight: 1 },
			{ partition: 3, weight: 1 },
		],
		memberIds: ["a", "b"],
	});
	expect(dealt.get("a")).toEqual([0, 3]);
	expect(dealt.get("b")).toEqual([1, 2]);

	// One very heavy partition keeps its member to that alone while the others can absorb the rest.
	const skewed = balancePartitions({
		partitions: [
			{ partition: 0, weight: 100 },
			{ partition: 1, weight: 1 },
			{ partition: 2, weight: 1 },
			{ partition: 3, weight: 1 },
			{ partition: 4, weight: 1 },
			{ partition: 5, weight: 1 },
			{ partition: 6, weight: 1 },
		],
		memberIds: ["a", "b", "c"],
	});
	expect(skewed.get("a")).toEqual([0]);
	expect(skewed.get("b")).toEqual([1, 3, 5]);
	expect(skewed.get("c")).toEqual([2, 4, 6]);
	expect(balancePartitions({ partitions: [], memberIds: [] }).size).toBe(0);
});
