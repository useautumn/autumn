import {
	getAwsTaskIdentity,
	hasAwsTaskIdentity,
} from "@/external/aws/ecs/awsTaskIdentity.js";
import {
	type BlueGreenServiceName,
	getActiveSlotConfig,
} from "./blueGreenSlotStore.js";

/**
 * True iff this process should run worker/cron work right now.
 *
 * Fail-open everywhere except an explicit serviceArn mismatch:
 *   - **Non-AWS host** (no ECS metadata) → true. Lets the same code run on
 *     Railway / local / any non-ECS host.
 *   - **ECS metadata didn't surface a service ARN** (rare) → true.
 *   - **No `flightcontrolBlueArn` in S3 record** → true.
 *   - **`flightcontrolBlueArn === identity.serviceArn`** → true.
 *   - **Otherwise** → false (the only stop case).
 *
 * Service ARN is the sole gate signal. It's stable across deploys (unlike
 * task definition revisions or image SHAs) — a fresh deploy to a service
 * doesn't desync the gate.
 */
export const isActiveSlot = ({
	serviceName: bgServiceName,
}: {
	serviceName: BlueGreenServiceName;
}): boolean => {
	if (!hasAwsTaskIdentity()) return true;

	const config = getActiveSlotConfig({ serviceName: bgServiceName });
	if (!config.flightcontrolBlueArn) return true;

	const identity = getAwsTaskIdentity();
	if (!identity?.serviceArn) return true;

	return identity.serviceArn === config.flightcontrolBlueArn;
};

/** Same logic as isActiveSlot, but returns a structured reason for diagnostics. */
export const describeSlotGate = ({
	serviceName: bgServiceName,
}: {
	serviceName: BlueGreenServiceName;
}) => {
	if (!hasAwsTaskIdentity()) {
		return { allowPoll: true, reason: "blue-green-disabled" as const };
	}
	const config = getActiveSlotConfig({ serviceName: bgServiceName });
	if (!config.flightcontrolBlueArn) {
		return { allowPoll: true, reason: "no-active-record" as const };
	}
	const identity = getAwsTaskIdentity();
	if (!identity?.serviceArn) {
		return { allowPoll: true, reason: "service-arn-unresolved" as const };
	}
	if (identity.serviceArn === config.flightcontrolBlueArn) {
		return {
			allowPoll: true,
			reason: "active" as const,
			matchedOn: "service-arn" as const,
			identity,
		};
	}
	return {
		allowPoll: false,
		reason: "idle" as const,
		identity,
		expectedServiceArn: config.flightcontrolBlueArn,
	};
};
