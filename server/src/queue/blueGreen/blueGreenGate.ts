import {
	getAwsTaskIdentity,
	hasAwsTaskIdentity,
} from "@/external/aws/ecs/awsTaskIdentity.js";
import {
	type BlueGreenServiceName,
	getActiveSlotConfig,
} from "./blueGreenSlotStore.js";

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
