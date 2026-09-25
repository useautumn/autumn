import type { Webhook, WebhookParams, WebhookSyncChange } from "@autumn/shared";

const sameEvents = ({ a, b }: { a: string[]; b: string[] }) => {
	const setA = new Set(a);
	const setB = new Set(b);
	return setA.size === setB.size && [...setA].every((event) => setB.has(event));
};

/** The remote webhook as the stated params would leave it; omitted optional
 * fields keep their remote value, so a sync only owns what it states. */
const applyStated = ({
	webhook,
	stated,
}: {
	webhook: Webhook;
	stated: WebhookParams;
}): Webhook => ({
	...webhook,
	url: stated.url,
	events: sameEvents({ a: webhook.events, b: stated.events })
		? webhook.events
		: stated.events,
	description:
		stated.description === undefined
			? webhook.description
			: stated.description || null,
	disabled: stated.disabled ?? webhook.disabled,
});

const isUnchanged = ({ before, after }: { before: Webhook; after: Webhook }) =>
	before.url === after.url &&
	before.description === after.description &&
	before.disabled === after.disabled &&
	sameEvents({ a: before.events, b: after.events });

/** What webhooks.sync would do: create missing, update differing, and report
 * every remote webhook the request doesn't state as unmanaged. Never deletes. */
export const computeWebhookSyncChanges = ({
	remote,
	stated,
	now,
}: {
	remote: Webhook[];
	stated: WebhookParams[];
	now: number;
}): WebhookSyncChange[] => {
	const remoteById = new Map(remote.map((webhook) => [webhook.id, webhook]));
	const statedIds = new Set(stated.map((params) => params.id));

	const statedChanges = stated.flatMap((params): WebhookSyncChange[] => {
		const before = remoteById.get(params.id);
		if (!before) {
			return [
				{
					action: "create",
					id: params.id,
					webhook: {
						id: params.id,
						url: params.url,
						description: params.description || null,
						events: params.events,
						disabled: params.disabled ?? false,
						created_at: now,
						updated_at: now,
					},
				},
			];
		}
		const after = applyStated({ webhook: before, stated: params });
		if (isUnchanged({ before, after })) return [];
		return [{ action: "update", id: params.id, before, after }];
	});

	const unmanaged = remote
		.filter((webhook) => !statedIds.has(webhook.id))
		.map(
			(webhook): WebhookSyncChange => ({
				action: "unmanaged",
				id: webhook.id,
				webhook,
			}),
		);

	return [...statedChanges, ...unmanaged];
};
