import {
	RecaseError,
	type SyncWebhooksResponse,
	type Webhook,
	type WebhookParams,
} from "@autumn/shared";
import { createWebhook } from "../createWebhook.js";
import { listWebhooks } from "../listWebhooks.js";
import { updateWebhook } from "../updateWebhook.js";
import { computeWebhookSyncChanges } from "./computeWebhookSyncChanges.js";

type ItemOutcome =
	| { ok: true; webhook: Webhook; secret?: string }
	| { ok: false; id: string; error: unknown };

const applyStated = async ({
	appId,
	params,
	isNew,
}: {
	appId: string;
	params: WebhookParams;
	isNew: boolean;
}): Promise<ItemOutcome> => {
	try {
		if (isNew) return { ok: true, ...(await createWebhook({ appId, params })) };
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
}: {
	failures: Extract<ItemOutcome, { ok: false }>[];
}): never => {
	const unexpected = failures.find(
		(failure) => !(failure.error instanceof RecaseError),
	);
	if (unexpected) throw unexpected.error;
	const [first] = failures as { id: string; error: RecaseError }[];
	throw new RecaseError({
		message: failures
			.map((failure) => `${failure.id}: ${errorMessage(failure)}`)
			.join("; "),
		code: first?.error.code,
		statusCode: first?.error.statusCode,
	});
};

/** Applies preview_sync's creates and updates. Unmanaged webhooks are left
 * alone, and only newly created ones return a secret. */
export const syncWebhooks = async ({
	appId,
	stated,
}: {
	appId: string;
	stated: WebhookParams[];
}): Promise<SyncWebhooksResponse> => {
	const remote = await listWebhooks({ appId });
	const changes = computeWebhookSyncChanges({
		remote,
		stated,
		now: Date.now(),
	});
	const statedById = new Map(stated.map((params) => [params.id, params]));

	const outcomes = await Promise.all(
		changes.flatMap((change) => {
			const params = statedById.get(change.id);
			if (!params || change.action === "unmanaged") return [];
			return [
				applyStated({ appId, params, isNew: change.action === "create" }),
			];
		}),
	);

	const successes = outcomes.filter((outcome) => outcome.ok);
	const failures = outcomes.filter((outcome) => !outcome.ok);
	if (failures.length > 0 && successes.length === 0) {
		throwWhenNothingSucceeded({ failures });
	}

	const resultById = new Map<string, Webhook>(
		remote.map((webhook) => [webhook.id, webhook]),
	);
	for (const { webhook } of successes) resultById.set(webhook.id, webhook);
	const failedIds = new Set(failures.map((failure) => failure.id));

	return {
		webhooks: stated.flatMap((params) =>
			failedIds.has(params.id) ? [] : (resultById.get(params.id) ?? []),
		),
		secrets: successes.flatMap(({ webhook, secret }) =>
			secret ? [{ id: webhook.id, secret }] : [],
		),
		errors: failures.map((failure) => ({
			id: failure.id,
			message: errorMessage(failure),
		})),
	};
};
