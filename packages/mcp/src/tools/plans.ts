import {
	CreatePlanParamsV2Schema,
	GetPlanParamsV0Schema,
	ListPlanParamsSchema,
} from "@autumn/shared/publicApiSchemas";
import { createDomainTools } from "./utils/builders.js";
import type { ToolDomain } from "./utils/types.js";

const endpoints = {
	listPlans: "/v1/plans.list",
	createPlan: "/v1/plans.create",
	getPlan: "/v1/plans.get",
} as const;

const schemas = {
	listPlans: ListPlanParamsSchema,
	createPlan: CreatePlanParamsV2Schema,
	getPlan: GetPlanParamsV0Schema,
} as const;

const { operation } = createDomainTools({ endpoints, schemas });

const domain = {
	operations: [
		operation({
			id: "listPlans",
			description:
				"List Autumn plans. For plan-management work, follow the Plan Management resource and Concepts resource.",
		}),
		operation({
			id: "createPlan",
			description:
				"Create an Autumn plan. Destructive configuration write: follow Plan Management and Concepts; gather confirmed plan_id, name, price, items/features, trials, and credit/overage setup before running.",
			destructive: true,
		}),
		operation({
			id: "getPlan",
			description:
				"Fetch one Autumn plan by id and optional version. For plan-management work, follow the Plan Management resource and Concepts resource.",
		}),
	],
} satisfies ToolDomain;

export const plans = { endpoints, schemas, domain };
