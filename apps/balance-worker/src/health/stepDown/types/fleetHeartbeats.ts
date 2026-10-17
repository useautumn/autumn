import type { SlotHeartbeat } from "../../../blueGreen/types/slotHeartbeat.js";

export type FleetHeartbeats = {
	heartbeats: SlotHeartbeat[];
	unreadable: number;
};
