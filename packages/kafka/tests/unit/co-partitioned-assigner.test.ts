import { expect, test } from "bun:test";
import { AssignerProtocol, type Cluster } from "kafkajs";
import { coPartitionedAssigner } from "../../src/kafka.js";

const partitionCount = 8;

function createAssigner() {
	const cluster = {
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
	return coPartitionedAssigner({
		cluster,
		groupId: "test",
		logger: {} as never,
	});
}

test("partition n of every topic lands on the same member, spread evenly", async () => {
	const assigner = createAssigner();
	const members = [{ memberId: "b" }, { memberId: "c" }, { memberId: "a" }];
	const assignments = await assigner.assign({
		members: members.map((member) => ({
			...member,
			memberMetadata: Buffer.alloc(0),
		})),
		topics: ["events", "commands"],
	});
	const byMember = new Map(
		assignments.map(({ memberId, memberAssignment }) => [
			memberId,
			AssignerProtocol.MemberAssignment.decode(memberAssignment)?.assignment,
		]),
	);
	for (const [, assignment] of byMember) {
		expect(assignment?.events).toEqual(assignment?.commands);
	}
	expect(byMember.get("a")?.events).toEqual([0, 3, 6]);
	expect(byMember.get("b")?.events).toEqual([1, 4, 7]);
	expect(byMember.get("c")?.events).toEqual([2, 5]);
	expect(assigner.protocol({ topics: ["events", "commands"] }).name).toBe(
		"CoPartitionedAssigner",
	);
});

function metadataFor(topics: string[]) {
	return AssignerProtocol.MemberMetadata.encode({
		version: 0,
		topics,
		userData: Buffer.alloc(0),
	});
}

function assignerWithTopicLookups() {
	const addedTopics: string[][] = [];
	const cluster = {
		findTopicPartitionMetadata: () =>
			Array.from({ length: partitionCount }, (_, partitionId) => ({
				partitionId,
				leader: 0,
				replicas: [0],
				isr: [0],
				partitionErrorCode: 0,
				offlineReplicas: [],
			})),
		addMultipleTargetTopics: async (topics: string[]) => {
			addedTopics.push(topics);
		},
	} as unknown as Cluster;
	const assigner = coPartitionedAssigner({
		cluster,
		groupId: "test",
		logger: {} as never,
	});
	return { assigner, addedTopics };
}

async function decodedAssignments(
	assigner: ReturnType<typeof coPartitionedAssigner>,
	members: { memberId: string; memberMetadata: Buffer }[],
	topics: string[],
) {
	const encoded = await assigner.assign({ members, topics });
	return new Map(
		encoded.map(({ memberId, memberAssignment }) => [
			memberId,
			AssignerProtocol.MemberAssignment.decode(memberAssignment)?.assignment,
		]),
	);
}

test("a member that does not read every topic in the group is dealt nothing", async () => {
	const { assigner } = assignerWithTopicLookups();
	const all = ["commands", "events", "migrations"];
	const byMember = await decodedAssignments(
		assigner,
		[
			{ memberId: "a", memberMetadata: metadataFor(all) },
			{ memberId: "b", memberMetadata: metadataFor(["events", "commands"]) },
		],
		all,
	);
	expect(byMember.has("b")).toBe(false);
	const a = byMember.get("a");
	for (const topic of all)
		expect(a?.[topic]).toEqual(
			Array.from({ length: partitionCount }, (_, partition) => partition),
		);
});

test("a leader that does not read a topic another member reads still deals it, to the members reading everything", async () => {
	const { assigner, addedTopics } = assignerWithTopicLookups();
	const byMember = await decodedAssignments(
		assigner,
		[
			{ memberId: "a", memberMetadata: metadataFor(["events", "commands"]) },
			{
				memberId: "b",
				memberMetadata: metadataFor(["events", "commands", "migrations"]),
			},
			{
				memberId: "c",
				memberMetadata: metadataFor(["events", "commands", "migrations"]),
			},
		],
		["events", "commands"],
	);
	expect(addedTopics).toEqual([["migrations"]]);
	expect(byMember.has("a")).toBe(false);
	for (const [, assignment] of byMember) {
		expect(assignment?.migrations).toEqual(assignment?.events);
		expect(assignment?.commands).toEqual(assignment?.events);
	}
	const dealt = [...byMember.values()].flatMap(
		(assignment) => assignment?.migrations ?? [],
	);
	expect(dealt.sort((x, y) => x - y)).toEqual(
		Array.from({ length: partitionCount }, (_, partition) => partition),
	);
});
