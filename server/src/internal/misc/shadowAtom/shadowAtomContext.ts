import type { AtomContext } from "@/internal/byoc/atomRecords/types/atomContext.js";
import { getShadowAtomDeployer } from "./getShadowAtomDeployer.js";
import { shadowAtomStorage } from "./shadowAtomStorage.js";
import type { ShadowAtomRecord } from "./types/shadowAtomRecord.js";

export const shadowAtomContext = ({
	deploymentGroupId,
}: {
	deploymentGroupId: string;
}): AtomContext<ShadowAtomRecord> => ({
	deployer: getShadowAtomDeployer(),
	storage: shadowAtomStorage({ deploymentGroupId }),
});
