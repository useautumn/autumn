import { HatchetClient } from "@hatchet-dev/typescript-sdk";

export const isHatchetEnabled = !!process.env.HATCHET_CLIENT_TOKEN;

export const hatchet = isHatchetEnabled ? HatchetClient.init() : null;
