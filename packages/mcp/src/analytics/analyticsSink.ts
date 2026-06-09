import type { AnalyticsSink } from "./analyticsTypes.js";
import { createLoggerAnalyticsSink } from "./loggerSink.js";

const DEFAULT_DATASET = "leaf";

const noopSink: AnalyticsSink = {
	emit() {},
	flush: async () => {},
};

let cachedSink: AnalyticsSink | null | undefined;
let overrideSink: AnalyticsSink | null | undefined;

/**
 * Override the analytics sink (tests, or wiring a pino/OTEL sink from the host
 * app). Pass `null` to disable. Pass `undefined` to fall back to env defaults.
 */
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

/** True when a real sink is configured — lets callers skip hot-path work. */
export const isAnalyticsEnabled = (): boolean =>
	getAnalyticsSink() !== noopSink;
