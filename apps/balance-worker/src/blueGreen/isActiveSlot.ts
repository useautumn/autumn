import type { ActiveSlotEdgeConfig } from "../edgeConfig/activeSlotEdgeConfig.js";
import type { TaskIdentity } from "./types/taskIdentity.js";

export type SlotGateDescription =
	| {
			active: true;
			reason: "blue-green-disabled" | "no-active-record" | "active";
	  }
	| { active: false; reason: "idle"; expectedServiceArn: string };

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
