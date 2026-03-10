import { HatchetClient } from "@hatchet-dev/typescript-sdk/v1";

export const isHatchetEnabled = !!process.env.HATCHET_CLIENT_TOKEN;

export const hatchet = isHatchetEnabled ? HatchetClient.init() : null;
