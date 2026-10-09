import {
	type AtomRoute,
	atomRouteColumns,
	type ByocCacheDeployment,
	ByocCacheStageStatus,
	ByocCacheStatus,
} from "@autumn/shared";

const ATOM_ROUTE_KEYS = Object.keys(atomRouteColumns) as (keyof AtomRoute)[];

/** Running, and Autumn reaches it; a removal marks `connected` done too, as it is no removal step. */
export const isCacheConnected = ({
	cacheDeployment,
}: {
	cacheDeployment: ByocCacheDeployment;
}) =>
	cacheDeployment.status === ByocCacheStatus.Ready &&
	cacheDeployment.stages.connected === ByocCacheStageStatus.Done;

/** A delete was asked for; the record stays until the org's stack is gone too. */
export const isCacheBeingRemoved = ({
	cacheDeployment,
}: {
	cacheDeployment: ByocCacheDeployment;
}) =>
	cacheDeployment.status === ByocCacheStatus.Removing ||
	cacheDeployment.status === ByocCacheStatus.TeardownRequired;

/** Nothing moves on its own from here: it is connected, failed, or waits on the org to delete its stack. */
export const isCacheSettled = ({
	cacheDeployment,
}: {
	cacheDeployment: ByocCacheDeployment;
}) =>
	isCacheConnected({ cacheDeployment }) ||
	cacheDeployment.status === ByocCacheStatus.Failed ||
	cacheDeployment.status === ByocCacheStatus.TeardownRequired;

/** What the cached org holds of an Atom changed, so herald must re-read it. */
export const changesAtomRoute = ({
	from,
	to,
}: {
	from: AtomRoute;
	to: AtomRoute;
}) => ATOM_ROUTE_KEYS.some((key) => from[key] !== to[key]);
