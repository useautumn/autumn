import { AssignerProtocol, type PartitionAssigner } from "kafkajs";

const ASSIGNER_NAME = "CoPartitionedAssigner";
const ASSIGNER_VERSION = 0;

/**
 * Partition n of every subscribed topic goes to the same member. Round robin
 * flattens topics first, so with two topics the same n can land on two workers.
 */
export function coPartitionedAssigner({
	cluster,
}: Parameters<PartitionAssigner>[0]): ReturnType<PartitionAssigner> {
	async function assign({
		members,
		topics,
	}: {
		members: { memberId: string }[];
		topics: string[];
	}) {
		const memberIds = members.map(memberIdOf).sort();
		const assignment = new Map<string, Record<string, number[]>>();
		for (const topic of topics) {
			for (const { partitionId } of cluster.findTopicPartitionMetadata(topic)) {
				const memberId = memberIds[partitionId % memberIds.length];
				if (memberId === undefined) continue;
				const byTopic = assignment.get(memberId) ?? {};
				(byTopic[topic] ??= []).push(partitionId);
				assignment.set(memberId, byTopic);
			}
		}
		const encoded = [];
		for (const [memberId, byTopic] of assignment) {
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
				userData: Buffer.alloc(0),
			}),
		};
	}

	return { name: ASSIGNER_NAME, version: ASSIGNER_VERSION, assign, protocol };
}

function memberIdOf({ memberId }: { memberId: string }): string {
	return memberId;
}
