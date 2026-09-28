export {
	createHeartbeatWriter,
	HEARTBEAT_INTERVAL_MS,
	type HeartbeatWriter,
	heartbeatKeyOf,
	instanceIdOf,
	runProbe,
} from "./heartbeat/createHeartbeatWriter.js";
export { fleetIdOf } from "./identity/fleetIdOf.js";
export {
	resolveTaskIdentity,
	type TaskIdentityEnv,
} from "./identity/resolveTaskIdentity.js";
export {
	type ActiveSlotEdgeConfig,
	ActiveSlotEdgeConfigSchema,
	activeSlotEdgeConfigOf,
	activeSlotKeyOf,
	defaultActiveSlotEdgeConfig,
} from "./slot/activeSlotEdgeConfig.js";
export { createSlotGate, type SlotGate } from "./slot/createSlotGate.js";
export { describeSlotGate, isActiveSlot } from "./slot/describeSlotGate.js";
export type { SlotGateDescription, SlotGateReason } from "./types/slotGate.js";
export {
	type SlotProbeResult,
	SlotProbeResultSchema,
} from "./types/slotProbe.js";
export type { TaskIdentity } from "./types/taskIdentity.js";
