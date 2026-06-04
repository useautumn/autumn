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
				"List Autumn plans. This is usually a cheap full scan; filter returned plans locally and use matching id/version pairs before customer queries based on plan attributes.",
		}),
		operation({
			id: "createPlan",
			description:
				"Create an Autumn plan. Destructive configuration write: gather plan_id, name, price, features/items, trials, and confirmation before running.",
			destructive: true,
		}),
		operation({
			id: "getPlan",
			description: "Fetch one Autumn plan by id and optional version.",
		}),
	],
} satisfies ToolDomain;

export const plans = { endpoints, schemas, domain };
