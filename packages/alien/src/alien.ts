export {
	ALIEN_LOCAL_MANAGER_URL,
	ALIEN_PROJECT,
	ALIEN_WORKSPACE,
} from "./alienConstants.js";
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
export type {
	AlienClient,
	AlienConfig,
	AlienDeployment,
	AlienSetup,
} from "./types/alienClient.js";
