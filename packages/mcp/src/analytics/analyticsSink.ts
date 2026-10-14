import type { AnalyticsSink } from "./analyticsTypes.js";
import { createLoggerAnalyticsSink } from "./loggerSink.js";

const DEFAULT_DATASET = "leaf";

const noopSink: AnalyticsSink = {
	emit() {},
	flush: async () => {},
};

let cachedSink: AnalyticsSink | null | undefined;
let overrideSink: AnalyticsSink | null | undefined;

export const setAnalyticsSink = (sink: AnalyticsSink | null | undefined) => {
	overrideSink = sink;
	if (sink !== undefined) cachedSink = undefined;
};

export const getAnalyticsSink = (): AnalyticsSink => {
	if (overrideSink !== undefined) return overrideSink ?? noopSink;
	if (cachedSink === undefined) {
		cachedSink = createLoggerAnalyticsSink({
			token: process.env.AXIOM_TOKEN,
			orgId: process.env.AXIOM_ORG_ID,
			dataset: process.env.MCP_ANALYTICS_DATASET ?? DEFAULT_DATASET,
		});
	}
	return cachedSink ?? noopSink;
};

export const isAnalyticsEnabled = (): boolean =>
	getAnalyticsSink() !== noopSink;
