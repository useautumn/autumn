import {
	type AlienDeployment,
	type AlienResourceState,
	deploymentToResources,
	isDeploymentAwaitingTeardown,
	isDeploymentInSetup,
	isDeploymentRunning,
} from "@autumn/alien";
import { BYOC_CACHE_REMOVAL_STAGES, ByocCacheStage } from "@autumn/shared";

const COMPUTE_CLUSTER_TYPE = "compute-cluster";
const RUNNING = "running";

/** alien's agent reports in every minute or so; ten minutes of silence means it lost touch. */
const HEARTBEAT_STALE_MS = 10 * 60 * 1000;

/** Connected rests on alien's heartbeat, the same for public and private networks. */
const hasRecentHeartbeat = ({ deployment }: { deployment: AlienDeployment }) =>
	deployment.lastHeartbeatAt != null &&
	Date.now() - Date.parse(deployment.lastHeartbeatAt) < HEARTBEAT_STALE_MS;

const hasVolume = ({ container }: { container?: AlienResourceState }) => {
	const volumes = container?.outputs?.volumes;
	return Array.isArray(volumes) && volumes.length > 0;
};

/** The deploy steps alien reports done for an Atom: its stack, the container's volume, machine and endpoint, its health, then its heartbeat. */
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
		[ByocCacheStage.LoadBalancer]:
			endpointUrl !== null || isDeploymentRunning({ deployment }),
		[ByocCacheStage.Atom]: isDeploymentRunning({ deployment }),
		[ByocCacheStage.Connected]:
			isDeploymentRunning({ deployment }) && hasRecentHeartbeat({ deployment }),
	};
	return Object.values(ByocCacheStage).filter((stage) => isDone[stage]);
};

const isGone = ({ resource }: { resource?: AlienResourceState }) =>
	!resource || resource.status === "deleted";

/** What a delete has taken down so far; once alien waits on the org's stack, all of it. */
export const alienDeploymentToRemovedStages = ({
	deployment,
	atomResourceId,
	endpointUrl,
}: {
	deployment: AlienDeployment;
	atomResourceId: string;
	endpointUrl: string | null;
}): ByocCacheStage[] => {
	if (isDeploymentAwaitingTeardown({ deployment }))
		return [...BYOC_CACHE_REMOVAL_STAGES];
	const resources = deploymentToResources({ deployment });
	const container = resources.find(({ id }) => id === atomResourceId);
	const computeCluster = resources.find(
		({ type }) => type === COMPUTE_CLUSTER_TYPE,
	);

	const isRemoved: Partial<Record<ByocCacheStage, boolean>> = {
		[ByocCacheStage.Atom]: container?.status !== RUNNING,
		[ByocCacheStage.Machine]: isGone({ resource: computeCluster }),
		[ByocCacheStage.LoadBalancer]: endpointUrl === null,
		[ByocCacheStage.Disk]:
			isGone({ resource: container }) || !hasVolume({ container }),
	};
	return BYOC_CACHE_REMOVAL_STAGES.filter((stage) => isRemoved[stage]);
};
