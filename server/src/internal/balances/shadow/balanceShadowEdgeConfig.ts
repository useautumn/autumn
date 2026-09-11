import { z } from "zod/v4";
import {
	BalanceShadowConfigSchema,
	parseBalanceShadowConfig,
} from "./parseBalanceShadowConfig.js";

export const BalanceShadowEdgeConfigSchema = z.discriminatedUnion("enabled", [
	z.strictObject({ enabled: z.literal(false) }),
	z.strictObject({ enabled: z.literal(true), run: BalanceShadowConfigSchema }),
]);

export function parseBalanceShadowEdgeConfig({
	input,
	runtimeEnv,
}: {
	input: unknown;
	runtimeEnv: Record<string, string | undefined>;
}) {
	const config = BalanceShadowEdgeConfigSchema.parse(input);
	if (!config.enabled) return undefined;
	return parseBalanceShadowConfig({
		runtimeEnv: {
			...runtimeEnv,
			BALANCE_WORKER_SHADOW: JSON.stringify(config.run),
		},
	});
}
