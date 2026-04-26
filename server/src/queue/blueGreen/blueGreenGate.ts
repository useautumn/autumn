import {
	getAwsTaskIdentity,
	hasAwsTaskIdentity,
} from "@/external/aws/ecs/awsTaskIdentity.js";
import { getActiveSlotConfig } from "./blueGreenSlotStore.js";

/**
 * True iff this process should run worker/cron work right now.
 *
 * Fail-open everywhere except active-record-mismatch:
 *   - **Non-AWS host** (no ECS metadata, no `FC_GIT_COMMIT_SHA`) → true.
 *     Lets us run the same code on Railway / local / any non-ECS host
 *     without blue-green configuration.
 *   - **No S3 active-slot record** (BG never enabled, or `createEdgeConfigStore`
 *     reset to defaults on S3 error) → true.
 *   - **S3 record present + identity matches** → true.
 *   - **S3 record present + identity does NOT match** → false (the only
 *     case where we stop consuming).
 */
export const isActiveSlot = (): boolean => {
	if (!hasAwsTaskIdentity()) return true;

	const config = getActiveSlotConfig();
	if (!config.activeTaskDefinitionArn && !config.activeImageSha) {
		return true;
	}

	const identity = getAwsTaskIdentity();
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
	if (!hasAwsTaskIdentity()) {
		return { allowPoll: true, reason: "blue-green-disabled" as const };
	}
	const config = getActiveSlotConfig();
	if (!config.activeTaskDefinitionArn && !config.activeImageSha) {
		return { allowPoll: true, reason: "no-active-record" as const };
	}
	const identity = getAwsTaskIdentity();
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
