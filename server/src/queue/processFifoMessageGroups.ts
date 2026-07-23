import type { Message } from "@aws-sdk/client-sqs";

export const processFifoMessageGroups = async <T>({
	messages,
	processMessage,
}: {
	messages: Message[];
	processMessage: (message: Message) => Promise<T>;
}): Promise<T[]> => {
	const groups = new Map<string, Message[]>();

	for (const message of messages) {
		const groupId =
			message.Attributes?.MessageGroupId ?? message.MessageId ?? "unknown";
		groups.set(groupId, [...(groups.get(groupId) ?? []), message]);
	}

	const results = await Promise.all(
		[...groups.values()].map(async (group) => {
			const processed: T[] = [];
			for (const message of group) {
				try {
					processed.push(await processMessage(message));
				} catch {
					break;
				}
			}
			return processed;
		}),
	);

	return results.flat();
};
