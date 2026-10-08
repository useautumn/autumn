import {
	type ByocCacheDeployment,
	ByocCacheStageStatus,
	ByocCacheStatus,
} from "@autumn/shared";
import { cacheDeploymentToStages } from "./cacheStageUtils.js";

/** Running, and Autumn reaches it. */
export const isCacheConnected = ({
	cacheDeployment,
}: {
	cacheDeployment: ByocCacheDeployment;
}) =>
	cacheDeploymentToStages({ cacheDeployment }).connected ===
	ByocCacheStageStatus.Done;

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
