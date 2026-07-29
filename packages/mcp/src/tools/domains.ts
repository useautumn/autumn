import { agent } from "./agent.js";
import { balances } from "./balances.js";
import { billing } from "./billing.js";
import { catalog } from "./catalog.js";
import { customers } from "./customers.js";
import { entities } from "./entities.js";
import { features } from "./features.js";
import { logs } from "./logs.js";
import { plans } from "./plans.js";
import type { ToolDomain } from "./utils/types.js";

/**
 * Every business domain's tool declarations. New domains must be added here so
 * both the composed toolsets (`index.ts`) and the approval-gated tool list
 * (`approvalGated.ts`) see them.
 */
export const domainModules = {
	agent,
	customers,
	entities,
	features,
	plans,
	catalog,
	billing,
	balances,
	logs,
} as const;

export const toolDomains: ToolDomain[] = Object.values(domainModules).map(
	(domainModule) => domainModule.domain,
);
