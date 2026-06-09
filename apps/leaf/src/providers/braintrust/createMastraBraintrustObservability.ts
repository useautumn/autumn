import { BraintrustExporter } from "@mastra/braintrust";
import { SpanType } from "@mastra/core/observability";
import { Observability, SamplingStrategyType } from "@mastra/observability";
import { currentSpan } from "braintrust";
import { braintrustConfig } from "./config.js";
import { createBraintrustLogger } from "./createBraintrustLogger.js";

export const createMastraBraintrustObservability = ({
	apiKey = process.env.BRAINTRUST_API_KEY,
	enabled = braintrustConfig.enabled,
	projectName = braintrustConfig.projectName,
	serviceName = braintrustConfig.serviceName,
	braintrustLogger = createBraintrustLogger({
		apiKey,
		enabled,
		projectName,
	}),
}: {
	apiKey?: string;
	braintrustLogger?: unknown;
	enabled?: boolean;
	projectName?: string;
	serviceName?: string;
} = {}): Observability | undefined => {
	if (!enabled) return undefined;
	const exporterConfig = {
		apiKey,
		braintrustLogger,
		currentSpan: () => currentSpan(),
		projectName,
	} as unknown as ConstructorParameters<typeof BraintrustExporter>[0];

	return new Observability({
		configs: {
			braintrust: {
				excludeSpanTypes: [SpanType.MODEL_CHUNK],
				exporters: [new BraintrustExporter(exporterConfig)],
				sampling: { type: SamplingStrategyType.ALWAYS },
				serializationOptions: {
					maxArrayLength: 50,
					maxDepth: 6,
					maxObjectKeys: 80,
					maxStringLength: 8_000,
				},
				serviceName,
			},
		},
	});
};
