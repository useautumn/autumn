import type { LintRule } from "../runtime/lintDocument";
import { nonEmpty, rejects, unique } from "./define";

/** The name `lintDocument` receives the shared URL guard under. */
export const LOCAL_URL_CHECK = "isLocalWebhookUrl";

export const webhookRules: LintRule[] = [
	unique({
		field: "id",
		because: "Two webhooks claiming one id race to define the same endpoint.",
	}),
	unique({
		field: "id",
		asEnvName: true,
		because:
			"Each webhook's signing secret is saved as AUTUMN_WEBHOOK_<ID>_SECRET, so these two would overwrite each other's secret. Rename one.",
	}),
	rejects({
		field: "url",
		check: LOCAL_URL_CHECK,
		because:
			"Autumn delivers from the internet, so localhost and private-network addresses can never be reached. Use a public URL or a tunnel (e.g. ngrok).",
	}),
	nonEmpty({
		field: "url",
		warning: true,
		because:
			"With no environment key the webhook is registered nowhere. Add `live`, `sandbox` or a sandbox's slug.",
	}),
];
