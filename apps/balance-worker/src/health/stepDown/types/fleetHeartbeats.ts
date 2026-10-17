import type { SlotHeartbeat } from "../../../blueGreen/types/slotHeartbeat.js";

export type FleetListing = ReadonlyMap<string, string>;

export type FleetRead = { listing: FleetListing; changed: SlotHeartbeat[] };
