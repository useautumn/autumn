import type { AutumnClient, SyncWebhooksParams } from "../../generated/client";
import type { WebhooksPreview } from "../../render/renderWebhooks";
import { webhookEnvSkipWarning } from "../pull/webhooks/webhookEnvSkipWarning";
import type { WebhookPullEnv } from "../pull/webhooks/webhookPullEnvs";
import { resolveWebhooksForEnv } from "./resolveWebhooksForEnv";
import type { WebhookEnv } from "./types/webhookEnv";
import {
	messageOf,
	throwWebhookEnvFailures,
	type WebhookEnvFailure,
} from "./webhookEnvFailures";
import { webhookSecretName } from "./webhookSecretName";

export type WebhookClient = Pick<
	AutumnClient,
	"previewSyncWebhooks" | "syncWebhooks"
>;

export type WebhookClientFor = (args: { secretKey: string }) => WebhookClient;

/** One env's share of a push: its preview, and exactly what the sync will send. */
export type WebhooksLane = {
	preview: WebhooksPreview;
	body: SyncWebhooksParams;
	env: WebhookEnv;
	client: WebhookClient;
};

export type WebhookLanes = {
	lanes: WebhooksLane[];
	/** Live webhooks a `-p` push would change; a plain push only reads them. */
	productionDiffers: string[];
	/** The read-only live check failed, so the preview can't claim production matches. */
	productionUnchecked: boolean;
	/** One warning per env whose key was rejected or belongs to another org. */
	skipped: string[];
};

type EnvPreview =
	| { lane: WebhooksLane; errors: { id: string; message: string }[] }
	| { skipped: string }
	| undefined;

const isLive = (env: WebhookPullEnv): boolean =>
	env.keyName === "AUTUMN_PROD_SECRET_KEY";

/**
 * Two slugs like `qa-team` and `qa_team` name one variable. A create in one
 * refuses when another synced env states the same id: its saved secret would be overwritten.
 */
const assertDistinctSecretNames = ({
	lanes,
}: {
	lanes: WebhooksLane[];
}): void => {
	const secretName = ({ lane, id }: { lane: WebhooksLane; id: string }) =>
		webhookSecretName({
			id,
			...(lane.env.live ? {} : { envKey: lane.env.key }),
		});
	const clashes = new Map<string, string>();
	for (const lane of lanes) {
		for (const change of lane.preview.changes) {
			if (change.action !== "create") continue;
			const name = secretName({ lane, id: change.id });
			for (const other of lanes) {
				if (other === lane) continue;
				const shares = other.body.webhooks.some(
					(webhook) => secretName({ lane: other, id: webhook.id }) === name,
				);
				if (!shares) continue;
				const [first, second] = [other.env.key, lane.env.key].sort();
				clashes.set(
					`${first}|${second}|${name}`,
					`${first} and ${second} would both save ${change.id}'s signing secret as ${name}. Rename one of those sandboxes so their names differ by more than punctuation.`,
				);
			}
		}
	}
	if (clashes.size > 0) throw new Error([...clashes.values()].join("\n"));
};

/** Undefined when the config registers nothing in this env: there is nothing to preview. */
const previewEnv = async ({
	env,
	rows,
	clientFor,
}: {
	env: WebhookPullEnv;
	rows: Record<string, unknown>[];
	clientFor: WebhookClientFor;
}): Promise<EnvPreview> => {
	try {
		const key = await env.envKey();
		const webhooks = resolveWebhooksForEnv({ rows, envKey: key });
		if (webhooks.length === 0) return undefined;
		const client = clientFor({ secretKey: env.secretKey });
		const body = { webhooks };
		const { changes, errors } = await client.previewSyncWebhooks(body);
		return {
			lane: {
				preview: { env: key, changes },
				body,
				env: { key, live: isLive(env) },
				client,
			},
			errors,
		};
	} catch (error) {
		const skipped = webhookEnvSkipWarning({ env, error });
		if (skipped === undefined) throw error;
		return { skipped };
	}
};

/**
 * A plain push syncs every sandbox env with a key, and previews live read-only
 * so a production diff is named rather than hidden; `-p` syncs live alone.
 * Absent when the config states no `webhooks`.
 */
export const previewWebhookEnvs = async ({
	rows,
	envs,
	prod,
	clientFor,
}: {
	rows: Record<string, unknown>[] | undefined;
	envs: (() => WebhookPullEnv[]) | undefined;
	prod: boolean;
	clientFor: WebhookClientFor | undefined;
}): Promise<WebhookLanes | undefined> => {
	if (rows === undefined) return undefined;
	if (envs === undefined || clientFor === undefined)
		throw new Error("webhooks need the env keys to pick each url.");
	const all = envs();
	const synced = all.filter((env) => isLive(env) === prod);
	const probed = prod ? [] : all.filter(isLive);
	const [syncedResults, probedResults] = await Promise.all([
		Promise.allSettled(
			synced.map((env) => previewEnv({ env, rows, clientFor })),
		),
		Promise.allSettled(
			probed.map((env) => previewEnv({ env, rows, clientFor })),
		),
	]);

	const lanes: WebhooksLane[] = [];
	const skipped: string[] = [];
	// Live is only read here, so its failure is a warning, never a blocked sandbox push.
	probedResults.forEach((result, index) => {
		if (result.status === "rejected")
			skipped.push(
				`⚠ webhooks: couldn't check ${probed[index]?.label ?? "live"} for changes (${messageOf(result.reason)})`,
			);
	});
	// A skipped live key (rejected, deleted, another org's) leaves production unchecked too.
	const productionUnchecked = probedResults.some(
		(result) =>
			result.status === "rejected" ||
			(result.value !== undefined && "skipped" in result.value),
	);
	// Refused items (several dashboard webhooks on one URL, say) fail the lane
	// here, beside every other lane's errors, rather than at apply.
	const failures: WebhookEnvFailure[] = [];
	syncedResults.forEach((result, index) => {
		const label = synced[index]?.label ?? "";
		if (result.status === "rejected") {
			failures.push({ env: label, message: messageOf(result.reason) });
			return;
		}
		const preview = result.value;
		if (preview === undefined) return;
		if ("skipped" in preview) {
			skipped.push(preview.skipped);
			return;
		}
		lanes.push(preview.lane);
		if (preview.errors.length > 0)
			failures.push({
				env: preview.lane.env.key,
				message: preview.errors
					.map(({ id, message }) => `${id}: ${message}`)
					.join("\n"),
			});
	});
	throwWebhookEnvFailures({
		failures,
		envCount: synced.length,
		warnings: skipped,
	});
	assertDistinctSecretNames({ lanes });

	const productionDiffers: string[] = [];
	for (const result of probedResults) {
		if (result.status === "rejected") continue;
		const preview = result.value;
		if (preview === undefined) continue;
		if ("skipped" in preview) {
			skipped.push(preview.skipped);
			continue;
		}
		const changed = preview.lane.preview.changes.filter(
			(change) => change.action !== "unmanaged",
		);
		productionDiffers.push(
			...new Set([
				...changed.map((change) => change.id),
				...preview.errors.map((error) => error.id),
			]),
		);
	}
	return { lanes, productionDiffers, productionUnchecked, skipped };
};
