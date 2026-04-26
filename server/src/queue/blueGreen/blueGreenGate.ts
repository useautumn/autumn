import {
	getResolvedWorkerIdentity,
	hasWorkerIdentity,
} from "./blueGreenSlotEnv.js";
import { getActiveSlotConfig } from "./blueGreenSlotStore.js";

/**
 * True iff this process should be consuming SQS messages right now.
 * Fail-open: any state in which we don't have a clear, healthy "you are idle"
 * signal lets workers consume. Specifically:
 *   - No worker identity resolved (local dev / non-ECS) → consume.
 *   - No active record in S3 (file missing OR store errored — `createEdgeConfigStore`
 *     resets to defaults on error, so this branch covers both) → consume.
 *   - Active record present and our identity matches → consume.
 *   - Active record present and our identity does NOT match → idle (the only
 *     case where we stop consuming).
 */
export const isActiveSlot = (): boolean => {
	if (!hasWorkerIdentity()) return true;

	const config = getActiveSlotConfig();
	if (!config.activeTaskDefinitionArn && !config.activeImageSha) {
		return true;
	}

	const identity = getResolvedWorkerIdentity();
	if (!identity) return true;

	if (
		config.activeTaskDefinitionArn &&
		identity.taskDefinitionArn &&
		config.activeTaskDefinitionArn === identity.taskDefinitionArn
	) {
		return true;
	}

	if (
		config.activeImageSha &&
		identity.imageSha &&
		config.activeImageSha === identity.imageSha
	) {
		return true;
	}

	return false;
};

/** Same logic as isActiveSlot, but returns a structured reason for diagnostics. */
export const describeSlotGate = () => {
	if (!hasWorkerIdentity()) {
		return { allowPoll: true, reason: "blue-green-disabled" as const };
	}
	const config = getActiveSlotConfig();
	if (!config.activeTaskDefinitionArn && !config.activeImageSha) {
		return { allowPoll: true, reason: "no-active-record" as const };
	}
	const identity = getResolvedWorkerIdentity();
	if (!identity) {
		return { allowPoll: true, reason: "identity-unresolved" as const };
	}

	const taskDefMatch =
		config.activeTaskDefinitionArn &&
		identity.taskDefinitionArn &&
		config.activeTaskDefinitionArn === identity.taskDefinitionArn;
	const shaMatch =
		config.activeImageSha &&
		identity.imageSha &&
		config.activeImageSha === identity.imageSha;

	if (taskDefMatch || shaMatch) {
		return {
			allowPoll: true,
			reason: "active" as const,
			matchedOn: taskDefMatch ? ("task-def" as const) : ("sha" as const),
			identity,
		};
	}
	return { allowPoll: false, reason: "idle" as const, identity, config };
};
