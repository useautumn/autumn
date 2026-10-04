import type { BuildVariant } from "./buildVariant.js";

/**
 * The arms this image carries; A is the control and always built. The staging arms edge config
 * picks which built arms run, so an experiment branch only adds arms here and guards their code.
 */
export const AB_EXPERIMENT: { arms: readonly BuildVariant[] } = { arms: ["A"] };
