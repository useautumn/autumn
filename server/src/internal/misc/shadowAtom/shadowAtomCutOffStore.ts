import { z } from "zod/v4";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";

/** Staging fault injection: until `until` (epoch ms), Autumn refuses the shadow Atom's calls, as if the network cut it off. */
const ShadowAtomCutOffSchema = z.object({ until: z.number().nullable() });

const store = createEdgeConfigStore<z.infer<typeof ShadowAtomCutOffSchema>>({
	s3Key: "admin/shadow-atom-cut-off.json",
	schema: ShadowAtomCutOffSchema,
	defaultValue: () => ({ until: null }),
	retainOnError: true,
});

registerEdgeConfig({ store });

/** The window closes on its own, so a forgotten cut-off heals without a second write. */
export const isShadowAtomCutOff = (): boolean => {
	const { until } = store.get();
	return until !== null && Date.now() < until;
};

export const _setShadowAtomCutOffForTesting = ({
	until,
}: {
	until: number | null;
}) => store._setRuntimeConfigForTesting({ until });
