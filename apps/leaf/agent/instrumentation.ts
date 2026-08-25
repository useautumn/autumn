import { BraintrustExporter } from "@braintrust/otel";
import { registerOTel } from "@vercel/otel";
import { defineInstrumentation } from "eve/instrumentation";

/** Braintrust traces the model loop — prompts, tool calls and results, token
 * usage, subagent spans. Axiom keeps session lifecycle (parks, reconnects,
 * cursors); the two join on the session id, which eve already puts on every
 * span as `eve.session.id` — the same value Axiom logs as `session_id`.
 *
 * Without BRAINTRUST_API_KEY no exporter is registered, so a missing key
 * costs traces, never turns. */

/** A laptop's turns must not land in the project used to investigate
 * production incidents. Matches how the agent identifies production
 * elsewhere, so the two can never disagree. */
const projectName = () => {
	if (process.env.BRAINTRUST_PROJECT) return process.env.BRAINTRUST_PROJECT;
	const isProduction =
		process.env.NODE_ENV === "production" || process.env.EVE_EMBEDDED === "1";
	return isProduction ? "leaf" : `leaf-local-${process.env.USER ?? "dev"}`;
};
export default defineInstrumentation({
	setup: ({ agentName }) => {
		if (!process.env.BRAINTRUST_API_KEY) return;
		registerOTel({
			serviceName: agentName,
			traceExporter: new BraintrustExporter({
				filterAISpans: true,
				parent: `project_name:${projectName()}`,
			}),
		});
	},
});
