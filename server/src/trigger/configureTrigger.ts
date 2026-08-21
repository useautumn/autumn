import { configure } from "@trigger.dev/sdk/v3";

/**
 * Point the trigger.dev SDK at autumn's project key.
 *
 * autumn and autumn-cloud each have their own trigger.dev project. We
 * keep autumn's secret under `TRIGGER_SERVER_SECRET_KEY` so the two
 * never collide in a shared shell — the SDK's default `TRIGGER_SECRET_KEY`
 * is left to autumn-cloud.
 *
 * Module side-effect: this `configure` call runs once on first import.
 * Anything that triggers tasks server-side imports from
 * `@/trigger/migrations/...`, which re-exports from this file's siblings,
 * so the configure happens before any `.trigger()` call.
 */
if (process.env.TRIGGER_SERVER_SECRET_KEY) {
	const previewBranch = process.env.TRIGGER_DEV_BRANCH?.trim();
	configure({
		secretKey: process.env.TRIGGER_SERVER_SECRET_KEY,
		// Must match `bunx trigger.dev dev --branch` from scripts/dev.ts —
		// otherwise local triggers land on `default` while the worker listens
		// on the isolated branch and never receives them.
		...(previewBranch && previewBranch !== "default" ? { previewBranch } : {}),
	});
}

/** True when we can enqueue onto autumn's Trigger project.
 * Workers inject `TRIGGER_SECRET_KEY`; local/non-prod also needs `TRIGGER_DEV_BRANCH`. */
export const isTriggerConfigured = (): boolean => {
	const hasAutumnKey = Boolean(process.env.TRIGGER_SERVER_SECRET_KEY);
	const hasInjectedKey = Boolean(process.env.TRIGGER_SECRET_KEY);
	if (!hasAutumnKey && !hasInjectedKey) return false;

	if (process.env.NODE_ENV === "production") return true;
	return Boolean(process.env.TRIGGER_DEV_BRANCH?.trim());
};
