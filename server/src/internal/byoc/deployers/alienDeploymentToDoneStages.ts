import {
	type AlienDeployment,
	type AlienResourceState,
	deploymentToResources,
	isDeploymentInSetup,
	isDeploymentRunning,
} from "@autumn/alien";
import { ByocCacheStage } from "@autumn/shared";

const COMPUTE_CLUSTER_TYPE = "compute-cluster";
const RUNNING = "running";

const hasVolume = ({ container }: { container?: AlienResourceState }) => {
	const volumes = container?.outputs?.volumes;
	return Array.isArray(volumes) && volumes.length > 0;
};

/** The deploy steps alien reports done for an Atom: its stack, then the container's volume, machine, endpoint and health. */
export const alienDeploymentToDoneStages = ({
	deployment,
	atomResourceId,
	endpointUrl,
}: {
	deployment: AlienDeployment;
	atomResourceId: string;
	endpointUrl: string | null;
}): ByocCacheStage[] => {
	const resources = deploymentToResources({ deployment });
	const container = resources.find(({ id }) => id === atomResourceId);
	const computeCluster = resources.find(
		({ type }) => type === COMPUTE_CLUSTER_TYPE,
	);

	const isDone: Partial<Record<ByocCacheStage, boolean>> = {
		[ByocCacheStage.Stack]: !isDeploymentInSetup({ deployment }),
		[ByocCacheStage.Disk]: hasVolume({ container }),
		[ByocCacheStage.Machine]: computeCluster?.status === RUNNING,
		[ByocCacheStage.LoadBalancer]: endpointUrl !== null,
		[ByocCacheStage.Atom]: isDeploymentRunning({ deployment }),
	};
	return Object.values(ByocCacheStage).filter((stage) => isDone[stage]);
};
