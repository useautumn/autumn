import type { LintRule } from "../runtime/lintDocument";
import { notMap, rejects, uniformPrefix, unique } from "./define";

/** The name `lintDocument` receives the shared URL guard under. */
export const LOCAL_URL_CHECK = "isLocalWebhookUrl";

export const webhookRules: LintRule[] = [
	notMap({
		field: "url",
		because:
			'Each webhook() is one endpoint in one env: split into one webhook() per env, e.g. webhook({ id, env: "live", url }).',
	}),
	unique({
		field: "id",
		alongside: "env",
		because:
			"Two webhooks claiming one id in one env race to define the same endpoint.",
	}),
	unique({
		field: "id",
		alongside: "env",
		asEnvName: true,
		because:
			"Each webhook's signing secret is saved under its id in an env var name, so these two would overwrite each other's secret. Rename one.",
	}),
	rejects({
		field: "url",
		check: LOCAL_URL_CHECK,
		because:
			"Autumn delivers from the internet, so localhost and private-network addresses can never be reached. Use a public URL or a tunnel (e.g. ngrok).",
	}),
	uniformPrefix({
		field: "events",
		prefix: "vercel.",
		because:
			"vercel.* events can't be mixed with other events in one webhook: they're delivered from a separate app. Make one webhook for each.",
	}),
];
