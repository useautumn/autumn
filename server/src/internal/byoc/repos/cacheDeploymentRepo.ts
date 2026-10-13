import { deleteCacheDeployment } from "./deleteCacheDeployment.js";
import { findCacheByTokenHash } from "./findCacheByTokenHash.js";
import { findCacheDeployment } from "./findCacheDeployment.js";
import { findCacheDeploymentByGroupId } from "./findCacheDeploymentByGroupId.js";
import { findCacheDeploymentById } from "./findCacheDeploymentById.js";
import { findRemovingCacheDeployments } from "./findRemovingCacheDeployments.js";
import { insertCacheDeployment } from "./insertCacheDeployment.js";
import { setCacheFirstCheckAt } from "./setCacheFirstCheckAt.js";
import { updateCacheDeployment } from "./updateCacheDeployment.js";

export const cacheDeploymentRepo = {
	find: findCacheDeployment,
	findRemoving: findRemovingCacheDeployments,
	findById: findCacheDeploymentById,
	findByGroupId: findCacheDeploymentByGroupId,
	findByTokenHash: findCacheByTokenHash,
	insert: insertCacheDeployment,
	update: updateCacheDeployment,
	setFirstCheckAt: setCacheFirstCheckAt,
	delete: deleteCacheDeployment,
};
