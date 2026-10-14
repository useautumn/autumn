import {
	type AtomRoute,
	atomRouteColumns,
	type ByocCacheDeployment,
	ByocCacheStageStatus,
	ByocCacheStatus,
} from "@autumn/shared";

const ATOM_ROUTE_KEYS = Object.keys(atomRouteColumns) as (keyof AtomRoute)[];

export const isCacheConnected = ({
	cacheDeployment,
}: {
	cacheDeployment: Pick<ByocCacheDeployment, "status" | "stages">;
}) =>
	cacheDeployment.status === ByocCacheStatus.Ready &&
	cacheDeployment.stages.connected === ByocCacheStageStatus.Done;

export const isCacheBeingRemoved = ({
	cacheDeployment,
}: {
	cacheDeployment: Pick<ByocCacheDeployment, "status">;
}) =>
	cacheDeployment.status === ByocCacheStatus.Removing ||
	cacheDeployment.status === ByocCacheStatus.TeardownRequired;

export const isCacheSettled = ({
	cacheDeployment,
}: {
	cacheDeployment: Pick<ByocCacheDeployment, "status" | "stages">;
}) =>
	isCacheConnected({ cacheDeployment }) ||
	cacheDeployment.status === ByocCacheStatus.Failed ||
	cacheDeployment.status === ByocCacheStatus.TeardownRequired;

export const changesAtomRoute = ({
	from,
	to,
}: {
	from: AtomRoute;
	to: AtomRoute;
}) => ATOM_ROUTE_KEYS.some((key) => from[key] !== to[key]);
