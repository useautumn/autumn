import {
	ErrCode,
	RecaseError,
	type SyncWebhooksResponse,
	type Webhook,
	type WebhookAppKind,
	type WebhookParams,
	type WebhookSyncChange,
	type WebhookSyncError,
	webhookAppKindOf,
} from "@autumn/shared";
import { withSvixErrors } from "@/external/svix/endpoints/withSvixErrors.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";
import type { WebhookApp } from "../apps/webhookApps.js";
import { createWebhook } from "../createWebhook.js";
import { updateWebhook } from "../updateWebhook.js";
import { adoptWebhook } from "./adoptWebhook.js";
import { computeWebhookSyncChanges } from "./computeWebhookSyncChanges.js";
import { listSyncRemote, type SyncRemote } from "./listSyncRemote.js";

type ItemOutcome =
	| { ok: true; webhook?: Webhook; secret?: string }
	| { ok: false; id: string; error: unknown };

const deleteChange = async ({
	remote,
	id,
}: {
	remote: SyncRemote;
	id: string;
}): Promise<ItemOutcome> => {
	// One app failing must not leave the other app's copy live.
	const results = await Promise.allSettled(
		(remote.appIdsOf.get(id) ?? []).map((appId) =>
			withSvixErrors({
				webhookId: id,
				run: () => createSvixCli().endpoint.delete(appId, id),
			}),
		),
	);
	const failed = results.find((result) => result.status === "rejected");
	return failed ? { ok: false, id, error: failed.reason } : { ok: true };
};

const applyChange = async ({
	remote,
	appIdForKind,
	change,
	params,
}: {
	remote: SyncRemote;
	appIdForKind: (kind: WebhookAppKind) => Promise<string>;
	change: Exclude<WebhookSyncChange, { action: "unmanaged" | "delete" }>;
	params: WebhookParams;
}): Promise<ItemOutcome> => {
	try {
		if (change.action === "create") {
			const appId = await appIdForKind(
				webhookAppKindOf({ events: params.events }),
			);
			return { ok: true, ...(await createWebhook({ appId, params })) };
		}
		const existingId = change.action === "adopt" ? change.before.id : change.id;
		const appId = remote.appIdOf.get(existingId) as string;
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

/** Applies preview_sync's creates, adoptions, updates and deletes. Unmanaged
 * webhooks are left alone, and only newly created ones return a secret. */
export const syncWebhooks = async ({
	apps,
	appIdForKind,
	stated,
	skipDeletions = true,
}: {
	apps: WebhookApp[];
	/** The app a created webhook goes to, created on first use. */
	appIdForKind: (kind: WebhookAppKind) => Promise<string>;
	stated: WebhookParams[];
	skipDeletions?: boolean;
}): Promise<SyncWebhooksResponse> => {
	const synced = await listSyncRemote({ apps });
	const { remote, uidlessIds } = synced;
	const { changes, errors: planned } = computeWebhookSyncChanges({
		...synced,
		stated,
		skipDeletions,
		now: Date.now(),
	});
	const statedById = new Map(stated.map((params) => [params.id, params]));
	const deletedIds = new Set<string>();

	const outcomes = await Promise.all(
		changes.flatMap((change) => {
			if (change.action === "delete") {
				if (deletedIds.has(change.id)) return [];
				deletedIds.add(change.id);
				return [deleteChange({ remote: synced, id: change.id })];
			}
			const params = statedById.get(change.id);
			if (!params || change.action === "unmanaged") return [];
			return [applyChange({ remote: synced, appIdForKind, change, params })];
		}),
	);

	const successes = outcomes.filter((outcome) => outcome.ok);
	const failures = outcomes.filter((outcome) => !outcome.ok);
	const failedCount = failures.length + planned.length;
	if (failedCount > 0 && failedCount === stated.length + deletedIds.size) {
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
	for (const { webhook } of successes)
		if (webhook) resultById.set(webhook.id, webhook);
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
			webhook && secret ? [{ id: webhook.id, secret }] : [],
		),
		errors,
	};
};
