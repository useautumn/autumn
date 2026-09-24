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

test("a member's join metadata carries its rounded, positive weights", () => {
	const assigner = createAssigner(
		new Map([
			[3, 12.6],
			[1, 0],
			[7, 5],
		]),
	);
	const { name, metadata } = assigner.protocol({ topics });
	expect(name).toBe("LoadAwareCoPartitionedAssigner");
	const decoded = AssignerProtocol.MemberMetadata.decode(metadata);
	expect(decoded?.topics).toEqual(topics);
	expect(JSON.parse(decoded?.userData.toString("utf8") ?? "")).toEqual({
		version: 1,
		weights: [
			[3, 13],
			[7, 5],
		],
	});
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
