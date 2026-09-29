import type { AlienDeployment } from "../types/alienClient.js";

const TERMINAL_FAILURE_STATUSES = ["error", "teardown-required"];

/** The portal creates the deployment when a setup method is picked; nothing has run in the cloud yet. */
export const isDeploymentAwaitingSetup = ({
	deployment,
}: {
	deployment: AlienDeployment;
}) => deployment.status === "pending";

export const isDeploymentRunning = ({
	deployment,
}: {
	deployment: AlienDeployment;
}) => deployment.status === "running";

/** Any `*-failed` phase, or a state alien cannot move on from by itself. */
export const hasDeploymentFailed = ({
	deployment,
}: {
	deployment: AlienDeployment;
}) =>
	deployment.status.endsWith("-failed") ||
	TERMINAL_FAILURE_STATUSES.includes(deployment.status);

const DELETION_STATUSES = ["delete-pending", "deleting", "deleted"];

/** A delete was already requested, by us or from alien's dashboard. */
export const isDeploymentBeingDeleted = ({
	deployment,
}: {
	deployment: AlienDeployment;
}) => DELETION_STATUSES.includes(deployment.status);
