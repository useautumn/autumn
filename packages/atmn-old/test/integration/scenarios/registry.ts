import { basicPlanScenario } from "./basic-plan.js";
import type { AtmnScenario } from "./types.js";

export const atmnScenarios = {
	[basicPlanScenario.key]: basicPlanScenario,
} as const satisfies Record<string, AtmnScenario>;

export type AtmnScenarioKey = Extract<keyof typeof atmnScenarios, string>;

export const isAtmnScenarioKey = (key: string): key is AtmnScenarioKey =>
	key in atmnScenarios;
