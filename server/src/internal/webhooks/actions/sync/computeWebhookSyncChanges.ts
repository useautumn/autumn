import {
	WEBHOOK_APP_SWITCH_MESSAGE,
	type Webhook,
	type WebhookAppKind,
	type WebhookParams,
	type WebhookSyncChange,
	type WebhookSyncError,
	webhookAppKindOf,
} from "@autumn/shared";

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
	id: stated.id,
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

const createdWebhook = ({
	params,
	now,
}: {
	params: WebhookParams;
	now: number;
}): Webhook => ({
	id: params.id,
	url: params.url,
	description: params.description || null,
	events: params.events,
	disabled: params.disabled ?? false,
	created_at: now,
	updated_at: now,
});

/** Which dashboard-made endpoint each new id takes over. A URL shared by several
 * dashboard endpoints, or claimed by several new ids, is refused, never created. */
const planAdoptions = ({
	newIds,
	uidless,
	kindOf,
}: {
	newIds: WebhookParams[];
	uidless: Webhook[];
	kindOf: (webhook: Webhook) => WebhookAppKind;
}) => {
	const adoptions = new Map<string, Webhook>();
	const errors: WebhookSyncError[] = [];

	for (const params of newIds) {
		const kind = webhookAppKindOf({ events: params.events });
		const matches = uidless.filter(
			(webhook) => webhook.url === params.url && kindOf(webhook) === kind,
		);
		const claimants = newIds.filter((other) => other.url === params.url);
		if (matches.length > 1) {
			errors.push({
				id: params.id,
				message: `${matches.length} dashboard webhooks use this URL; delete the extras or give one an id in the dashboard`,
			});
		} else if (matches.length === 1 && claimants.length > 1) {
			errors.push({
				id: params.id,
				message: `${claimants.length} listed webhooks use the URL of one dashboard webhook; give them different URLs or list only one`,
			});
		} else if (matches.length === 1 && matches[0]) {
			adoptions.set(params.id, matches[0]);
		}
	}
	return { adoptions, errors };
};

/** What webhooks.sync would do: create missing, adopt a dashboard-made webhook
 * with the same URL, update differing, and report every remote webhook the
 * request doesn't state as unmanaged. Never deletes. */
export const computeWebhookSyncChanges = ({
	remote,
	uidlessIds = new Set(),
	remoteKinds = new Map(),
	stated,
	now,
}: {
	remote: Webhook[];
	uidlessIds?: Set<string>;
	/** Which app each remote webhook lives in; the main app when absent. */
	remoteKinds?: Map<string, WebhookAppKind>;
	stated: WebhookParams[];
	now: number;
}): { changes: WebhookSyncChange[]; errors: WebhookSyncError[] } => {
	const kindOf = (webhook: Webhook): WebhookAppKind =>
		remoteKinds.get(webhook.id) ?? "main";
	// A dashboard endpoint stated by its own `ep_…` id is addressed directly;
	// only the ones the request doesn't name are up for adoption by URL.
	const statedIds = new Set(stated.map((params) => params.id));
	const ownedById = new Map(
		remote
			.filter(
				(webhook) => !uidlessIds.has(webhook.id) || statedIds.has(webhook.id),
			)
			.map((webhook) => [webhook.id, webhook]),
	);
	const uidless = remote.filter(
		(webhook) => uidlessIds.has(webhook.id) && !statedIds.has(webhook.id),
	);

	const { adoptions, errors } = planAdoptions({
		newIds: stated.filter((params) => !ownedById.has(params.id)),
		uidless,
		kindOf,
	});
	for (const params of stated) {
		const existing = ownedById.get(params.id);
		if (
			existing &&
			kindOf(existing) !== webhookAppKindOf({ events: params.events })
		)
			errors.push({ id: params.id, message: WEBHOOK_APP_SWITCH_MESSAGE });
	}
	const failedIds = new Set(errors.map((error) => error.id));

	const statedChanges = stated.flatMap((params): WebhookSyncChange[] => {
		if (failedIds.has(params.id)) return [];
		const existing = ownedById.get(params.id);
		if (existing) {
			const after = applyStated({ webhook: existing, stated: params });
			if (isUnchanged({ before: existing, after })) return [];
			return [{ action: "update", id: params.id, before: existing, after }];
		}
		const adopted = adoptions.get(params.id);
		if (adopted) {
			const after = applyStated({ webhook: adopted, stated: params });
			return [{ action: "adopt", id: params.id, before: adopted, after }];
		}
		return [
			{
				action: "create",
				id: params.id,
				webhook: createdWebhook({ params, now }),
			},
		];
	});

	const adoptedIds = new Set([...adoptions.values()].map(({ id }) => id));
	const unmanaged = remote
		.filter(
			(webhook) =>
				!(ownedById.has(webhook.id) && statedIds.has(webhook.id)) &&
				!adoptedIds.has(webhook.id),
		)
		.map(
			(webhook): WebhookSyncChange => ({
				action: "unmanaged",
				id: webhook.id,
				webhook,
			}),
		);

	return { changes: [...statedChanges, ...unmanaged], errors };
};
