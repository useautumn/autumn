import type { AtomContext } from "@/internal/byoc/atomRecords/types/atomContext.js";
import { getShadowAtomDeployer } from "./getShadowAtomDeployer.js";
import { shadowAtomStorage } from "./shadowAtomStorage.js";
import type { ShadowAtomRecord } from "./types/shadowAtomRecord.js";

/** One shadow Atom for the shared lifecycle: alien, and its record in the edge config following its group. */
export const shadowAtomContext = ({
	deploymentGroupId,
}: {
	deploymentGroupId: string;
}): AtomContext<ShadowAtomRecord> => ({
	deployer: getShadowAtomDeployer(),
	storage: shadowAtomStorage({ deploymentGroupId }),
});
