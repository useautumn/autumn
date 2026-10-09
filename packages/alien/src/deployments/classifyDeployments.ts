import type { AlienDeployment } from "../types/alienClient.js";

const TERMINAL_FAILURE_STATUSES = ["error", "teardown-required"];

/** Registered by the customer's stack, but alien has not deployed anything into it yet. */
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

const SETUP_STATUSES = [
	"pending",
	"preflights-failed",
	"initial-setup",
	"initial-setup-failed",
];

/** The customer's stack is not in place yet, or failed going in. */
export const isDeploymentInSetup = ({
	deployment,
}: {
	deployment: AlienDeployment;
}) => SETUP_STATUSES.includes(deployment.status);

const REMOVING_STATUSES = ["delete-pending", "deleting", "delete-failed"];

/** A delete is tearing down what runs, or stopped partway. */
export const isDeploymentRemoving = ({
	deployment,
}: {
	deployment: AlienDeployment;
}) => REMOVING_STATUSES.includes(deployment.status);

const TEARDOWN_STATUSES = ["teardown-required", "teardown-failed"];

/** What ran is gone; the customer's stack waits on them to delete it. */
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
