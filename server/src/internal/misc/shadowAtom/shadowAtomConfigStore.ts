import {
	type ShadowAtomConfig,
	ShadowAtomConfigSchema,
	shadowAtomConfig,
} from "@autumn/edge-config";
import type { z } from "zod/v4";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";

/** Our shadow Atom per env and whom it holds; herald polls the same object. A read error keeps the last good config. */
const store = createEdgeConfigStore<ShadowAtomConfig>({
	s3Key: shadowAtomConfig.key,
	schema: shadowAtomConfig.schema,
	defaultValue: shadowAtomConfig.defaultValue,
	retainOnError: true,
});

registerEdgeConfig({ store });

/** Held by every admin write, so two staff saves never drop each other's change. */
export const SHADOW_ATOM_CONFIG_LOCK_KEY = "admin:shadow-atom-config";

/** The store handle, for the admin routes that read and write the source. */
export const shadowAtomConfigStore = store;
export const getShadowAtomConfig = (): ShadowAtomConfig => store.get();
export const _setShadowAtomConfigForTesting = ({
	config,
}: {
	config: z.input<typeof ShadowAtomConfigSchema>;
}) => store._setRuntimeConfigForTesting(ShadowAtomConfigSchema.parse(config));
