export { ALIEN_WORKSPACE } from "./alienConstants.js";
export {
	AlienRequestError,
	isAlienRequestError,
} from "./common/alienRequestError.js";
export { createAlienClient } from "./createAlienClient.js";
export {
	hasDeploymentFailed,
	isDeploymentAwaitingSetup,
	isDeploymentAwaitingTeardown,
	isDeploymentBeingDeleted,
	isDeploymentDeleted,
	isDeploymentInSetup,
	isDeploymentRemoving,
	isDeploymentRunning,
} from "./deployments/classifyDeployments.js";
export { deploymentToPoolMachine } from "./deployments/deploymentToPoolMachine.js";
export { deploymentToPublicEndpointUrl } from "./deployments/deploymentToPublicEndpointUrl.js";
export {
	deploymentToErrorMessage,
	deploymentToResources,
} from "./deployments/deploymentToResources.js";
export { toDeploymentGroupName } from "./setup/deploymentGroupName.js";
export type {
	AlienClient,
	AlienConfig,
	AlienDeployment,
	AlienEnvironmentVariable,
	AlienFixedPools,
	AlienNetwork,
	AlienResourceState,
	AlienSetup,
} from "./types/alienClient.js";
