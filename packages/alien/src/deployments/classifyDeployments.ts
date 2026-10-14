import type { AlienDeployment } from "../types/alienClient.js";

const TERMINAL_FAILURE_STATUSES = ["error", "teardown-required"];

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

export const hasDeploymentFailed = ({
	deployment,
}: {
	deployment: AlienDeployment;
}) =>
	deployment.status.endsWith("-failed") ||
	TERMINAL_FAILURE_STATUSES.includes(deployment.status);

const DELETION_STATUSES = ["delete-pending", "deleting", "deleted"];

export const isDeploymentBeingDeleted = ({
	deployment,
}: {
	deployment: AlienDeployment;
}) => DELETION_STATUSES.includes(deployment.status);

const SETUP_STATUSES = [
	"pending",
	"preflights-failed",
	"initial-setup",
	"initial-setup-failed",
];

export const isDeploymentInSetup = ({
	deployment,
}: {
	deployment: AlienDeployment;
}) => SETUP_STATUSES.includes(deployment.status);

const REMOVING_STATUSES = ["delete-pending", "deleting", "delete-failed"];

export const isDeploymentRemoving = ({
	deployment,
}: {
	deployment: AlienDeployment;
}) => REMOVING_STATUSES.includes(deployment.status);

const TEARDOWN_STATUSES = ["teardown-required", "teardown-failed"];

export const isDeploymentAwaitingTeardown = ({
	deployment,
}: {
	deployment: AlienDeployment;
}) => TEARDOWN_STATUSES.includes(deployment.status);

export const isDeploymentDeleted = ({
	deployment,
}: {
	deployment: AlienDeployment;
}) => deployment.status === "deleted";
