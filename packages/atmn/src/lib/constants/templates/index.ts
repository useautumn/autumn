/**
 * Template configurations index
 */

import type { Feature, Plan } from "../../../compose/models/index.js";
import * as linear from "./linear.config.js";
import * as openai from "./openai.config.js";
import * as railway from "./railway.config.js";
import * as t3chat from "./t3chat.config.js";

export interface TemplateConfig {
	features: Feature[];
	plans: Plan[];
}

export const templateConfigs: Record<string, TemplateConfig> = {
	OpenAI: {
		features: openai.features,
		plans: openai.plans,
	},
	"T3 Chat": {
		features: t3chat.features,
		plans: t3chat.plans,
	},
	Railway: {
		features: railway.features,
		plans: railway.plans,
	},
	Linear: {
		features: linear.features,
		plans: linear.plans,
	},
};
