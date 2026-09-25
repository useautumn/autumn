import {
	ErrCode,
	RecaseError,
	type SyncWebhooksResponse,
	type Webhook,
	type WebhookParams,
	type WebhookSyncChange,
	type WebhookSyncError,
} from "@autumn/shared";
import { createWebhook } from "../createWebhook.js";
import { updateWebhook } from "../updateWebhook.js";
import { adoptWebhook } from "./adoptWebhook.js";
import { computeWebhookSyncChanges } from "./computeWebhookSyncChanges.js";
import { listSyncRemote } from "./listSyncRemote.js";

type ItemOutcome =
	| { ok: true; webhook: Webhook; secret?: string }
	| { ok: false; id: string; error: unknown };

const applyChange = async ({
	appId,
	change,
	params,
}: {
	appId: string;
	change: Exclude<WebhookSyncChange, { action: "unmanaged" }>;
	params: WebhookParams;
}): Promise<ItemOutcome> => {
	try {
		if (change.action === "create") {
			return { ok: true, ...(await createWebhook({ appId, params })) };
		}
		if (change.action === "adopt") {
			const webhook = await adoptWebhook({
				appId,
				endpointId: change.before.id,
				params,
			});
			return { ok: true, webhook };
		}
		return { ok: true, webhook: await updateWebhook({ appId, params }) };
	} catch (error) {
		return { ok: false, id: params.id, error };
	}
};

const errorMessage = ({ error }: { error: unknown }) =>
	error instanceof RecaseError ? error.message : "Internal error";

/** Every item fails alone: a created webhook's secret is only ever shown here,
 * so one failure must never hide another item's success. */
const throwWhenNothingSucceeded = ({
	failures,
	planned,
}: {
	failures: Extract<ItemOutcome, { ok: false }>[];
	planned: WebhookSyncError[];
}): never => {
	const unexpected = failures.find(
		(failure) => !(failure.error instanceof RecaseError),
	);
	if (unexpected) throw unexpected.error;
	const first = failures[0]?.error as RecaseError | undefined;
	throw new RecaseError({
		message: [
			...planned,
			...failures.map((failure) => ({
				id: failure.id,
				message: errorMessage(failure),
			})),
		]
			.map(({ id, message }) => `${id}: ${message}`)
			.join("; "),
		code: first?.code ?? ErrCode.AmbiguousWebhookUrl,
		statusCode: first?.statusCode ?? 409,
	});
};

/** Applies preview_sync's creates, adoptions and updates. Unmanaged webhooks are
 * left alone, and only newly created ones return a secret. */
export const syncWebhooks = async ({
	appId,
	stated,
}: {
	appId: string;
	stated: WebhookParams[];
}): Promise<SyncWebhooksResponse> => {
	const { remote, uidlessIds } = await listSyncRemote({ appId });
	const { changes, errors: planned } = computeWebhookSyncChanges({
		remote,
		uidlessIds,
		stated,
		now: Date.now(),
	});
	const statedById = new Map(stated.map((params) => [params.id, params]));

	const outcomes = await Promise.all(
		changes.flatMap((change) => {
			const params = statedById.get(change.id);
			if (!params || change.action === "unmanaged") return [];
			return [applyChange({ appId, change, params })];
		}),
	);

	const successes = outcomes.filter((outcome) => outcome.ok);
	const failures = outcomes.filter((outcome) => !outcome.ok);
	const failedCount = failures.length + planned.length;
	if (failedCount > 0 && failedCount === stated.length) {
		throwWhenNothingSucceeded({ failures, planned });
	}

	// A dashboard webhook the request names by its own `ep_…` id is listed too.
	const statedIds = new Set(stated.map((params) => params.id));
	const resultById = new Map<string, Webhook>(
		remote
			.filter(
				(webhook) => !uidlessIds.has(webhook.id) || statedIds.has(webhook.id),
			)
			.map((webhook) => [webhook.id, webhook]),
	);
	for (const { webhook } of successes) resultById.set(webhook.id, webhook);
	const errors: WebhookSyncError[] = [
		...planned,
		...failures.map((failure) => ({
			id: failure.id,
			message: errorMessage(failure),
		})),
	];
	const failedIds = new Set(errors.map((error) => error.id));

	return {
		webhooks: stated.flatMap((params) =>
			failedIds.has(params.id) ? [] : (resultById.get(params.id) ?? []),
		),
		secrets: successes.flatMap(({ webhook, secret }) =>
			secret ? [{ id: webhook.id, secret }] : [],
		),
		errors,
	};
};
