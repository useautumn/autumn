import type { ActiveSlotEdgeConfig } from "../edgeConfig/activeSlotEdgeConfig.js";
import type { TaskIdentity } from "./types/taskIdentity.js";

export type SlotGateDescription =
	| {
			active: true;
			reason: "blue-green-disabled" | "no-active-record" | "active";
	  }
	| { active: false; reason: "idle"; expectedServiceArn: string };

/** Fail-open everywhere except an explicit service ARN mismatch, the same rules as the server's gate. */
export function describeSlotGate({
	identity,
	config,
}: {
	identity: TaskIdentity;
	config: ActiveSlotEdgeConfig;
}): SlotGateDescription {
	if (!identity.serviceArn)
		return { active: true, reason: "blue-green-disabled" };
	if (!config.flightcontrolBlueArn)
		return { active: true, reason: "no-active-record" };
	if (identity.serviceArn === config.flightcontrolBlueArn)
		return { active: true, reason: "active" };
	return {
		active: false,
		reason: "idle",
		expectedServiceArn: config.flightcontrolBlueArn,
	};
}

export function isActiveSlot(params: {
	identity: TaskIdentity;
	config: ActiveSlotEdgeConfig;
}): boolean {
	return describeSlotGate(params).active;
}
