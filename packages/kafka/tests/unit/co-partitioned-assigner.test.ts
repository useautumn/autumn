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
