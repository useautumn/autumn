import chalk from "chalk";
import type { PreviewSyncWebhooksResponse } from "../generated/client";

type WebhookChange = PreviewSyncWebhooksResponse["changes"][number];
type WebhookState = Extract<WebhookChange, { action: "create" }>["webhook"];

/** One push's webhook lane: the server's diff plus the entries this env skips. */
export type WebhooksPreview = {
	/** The `url` key the push targets. */
	envKey: string;
	changes: WebhookChange[];
	/** Config ids with no url for this env. */
	skipped: string[];
};

export const webhooksHaveWork = ({
	webhooks,
}: {
	webhooks: WebhooksPreview | undefined;
}): boolean =>
	(webhooks?.changes ?? []).some(
		(change) => change.action === "create" || change.action === "update",
	);

const DETAIL_INDENT = "      ";

const list = (values: readonly string[]): string =>
	values.length === 0 ? "(none)" : values.join(", ");

/** Every field that moved, one line each; the URL first, since it is the one that bites. */
const updateDetails = ({
	id,
	before,
	after,
}: {
	id: string;
	before: WebhookState;
	after: WebhookState;
}): string[] => {
	const lines: string[] = [];
	if (before.url !== after.url)
		lines.push(`${id} url: ${before.url} → ${after.url}`);
	const events = (state: WebhookState) => [...state.events].sort();
	if (events(before).join() !== events(after).join())
		lines.push(`events: ${list(events(before))} → ${list(events(after))}`);
	if ((before.description ?? "") !== (after.description ?? ""))
		lines.push(
			`description: ${JSON.stringify(before.description ?? "")} → ${JSON.stringify(after.description ?? "")}`,
		);
	if (before.disabled !== after.disabled)
		lines.push(`disabled: ${before.disabled} → ${after.disabled}`);
	return lines.map((line) => `${DETAIL_INDENT}${chalk.yellow(line)}`);
};

const renderChange = ({ change }: { change: WebhookChange }): string[] => {
	if (change.action === "create")
		return [
			`  ${chalk.green(`+ ${change.id}`)}${chalk.dim(`  ${change.webhook.url}`)}`,
			`${DETAIL_INDENT}${chalk.dim(`events: ${list(change.webhook.events)}`)}`,
		];
	if (change.action === "update")
		return [
			`  ${chalk.yellow(`~ ${change.id}`)}`,
			...updateDetails({
				id: change.id,
				before: change.before,
				after: change.after,
			}),
		];
	return [
		chalk.dim(
			`  · ${change.id}  unmanaged (not in your config; atmn leaves it alone)`,
		),
	];
};

/** Null when the lane has nothing to say, so push prints no empty heading. */
export const renderWebhooks = ({
	webhooks,
}: {
	webhooks: WebhooksPreview;
}): string | null => {
	const rows = [
		...webhooks.changes.flatMap((change) => renderChange({ change })),
		...webhooks.skipped.map((id) =>
			chalk.dim(`  · ${id}  skipped (no url for ${webhooks.envKey})`),
		),
	];
	if (rows.length === 0) return null;
	const count = webhooks.changes.filter(
		(change) => change.action !== "unmanaged",
	).length;
	return [chalk.bold(`Webhooks (${count})`), ...rows].join("\n");
};
