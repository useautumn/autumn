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
	configure({ secretKey: process.env.TRIGGER_SERVER_SECRET_KEY });
}
