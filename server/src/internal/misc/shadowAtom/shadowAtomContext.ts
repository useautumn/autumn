import type { AtomContext } from "@/internal/byoc/atomRecords/types/atomContext.js";
import { getShadowAtomDeployer } from "./getShadowAtomDeployer.js";
import { shadowAtomStorage } from "./shadowAtomStorage.js";
import type { ShadowAtomRecord } from "./types/shadowAtomRecord.js";

/** Our shadow Atom for the shared lifecycle: alien, and its edge config. */
export const shadowAtomContext = (): AtomContext<ShadowAtomRecord> => ({
	deployer: getShadowAtomDeployer(),
	storage: shadowAtomStorage,
});
