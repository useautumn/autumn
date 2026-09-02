import { BraintrustExporter } from "@braintrust/otel";
import { registerOTel } from "@vercel/otel";
import { defineInstrumentation } from "eve/instrumentation";

// Braintrust traces the model loop; Axiom keeps session lifecycle. The two
// join on `eve.session.id` = Axiom's `session_id`. No key → no traces, never no turns.

// A laptop's turns must not land in the production-incident Braintrust project.
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
