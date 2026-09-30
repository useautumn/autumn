export { ALIEN_WORKSPACE } from "./alienConstants.js";
export {
	AlienRequestError,
	isAlienRequestError,
} from "./common/alienRequestError.js";
export { createAlienClient } from "./createAlienClient.js";
export {
	hasDeploymentFailed,
	isDeploymentAwaitingSetup,
	isDeploymentBeingDeleted,
	isDeploymentRunning,
} from "./deployments/classifyDeployments.js";
export { deploymentToPublicEndpointUrl } from "./deployments/deploymentToPublicEndpointUrl.js";
export type {
	AlienClient,
	AlienConfig,
	AlienDeployment,
	AlienEnvironmentVariable,
	AlienSetup,
} from "./types/alienClient.js";
