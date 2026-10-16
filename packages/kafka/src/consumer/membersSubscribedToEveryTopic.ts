import { AssignerProtocol, type PartitionAssigner } from "kafkajs";

type Cluster = Parameters<PartitionAssigner>[0]["cluster"];
type GroupMember = { memberId: string; memberMetadata: Buffer };

/**
 * kafkajs drops any assigned topic its member did not subscribe to, and the leader only knows
 * its own subscription; so every topic any member reads is dealt, and only to members reading them all.
 */
export async function membersSubscribedToEveryTopic<
	Member extends GroupMember,
>({
	cluster,
	members,
	topics,
}: {
	cluster: Cluster;
	members: readonly Member[];
	topics: readonly string[];
}): Promise<{ members: Member[]; topics: string[] }> {
	const subscriptions = new Map<string, Set<string>>();
	for (const member of members)
		subscriptions.set(
			member.memberId,
			subscriptionOf({ member, fallback: topics }),
		);
	const everyTopic = new Set(topics);
	for (const subscribed of subscriptions.values())
		for (const topic of subscribed) everyTopic.add(topic);
	const unknownToLeader: string[] = [];
	for (const topic of everyTopic)
		if (!topics.includes(topic)) unknownToLeader.push(topic);
	if (unknownToLeader.length > 0)
		await cluster.addMultipleTargetTopics(unknownToLeader);
	const subscribedToAll: Member[] = [];
	for (const member of members)
		if (
			readsEveryTopic({
				subscribed: subscriptions.get(member.memberId),
				topics: everyTopic,
			})
		)
			subscribedToAll.push(member);
	return { members: subscribedToAll, topics: [...everyTopic].sort() };
}

function readsEveryTopic({
	subscribed,
	topics,
}: {
	subscribed: ReadonlySet<string> | undefined;
	topics: ReadonlySet<string>;
}): boolean {
	if (!subscribed) return false;
	for (const topic of topics) if (!subscribed.has(topic)) return false;
	return true;
}

/** A member whose metadata carries no subscription is taken to read what the leader reads. */
function subscriptionOf({
	member,
	fallback,
}: {
	member: GroupMember;
	fallback: readonly string[];
}): Set<string> {
	const decoded = decodedTopicsOf({ memberMetadata: member.memberMetadata });
	return new Set(decoded?.length ? decoded : fallback);
}

function decodedTopicsOf({
	memberMetadata,
}: {
	memberMetadata: Buffer;
}): string[] | undefined {
	try {
		return AssignerProtocol.MemberMetadata.decode(memberMetadata)?.topics;
	} catch {
		return undefined;
	}
}
