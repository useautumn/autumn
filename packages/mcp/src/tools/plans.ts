import {
	CreatePlanParamsV2Schema,
	GetPlanParamsV0Schema,
	ListPlanParamsSchema,
	UpdatePlanParamsV2Schema,
} from "@autumn/shared/publicApiSchemas";
import { createDomainTools } from "./utils/builders.js";
import type { ToolDomain } from "./utils/types.js";

const endpoints = {
	listPlans: "/v1/plans.list",
	createPlan: "/v1/plans.create",
	getPlan: "/v1/plans.get",
	hasCustomers: "/v1/plans.has_customers",
	updatePlan: "/v1/plans.update",
} as const;

const schemas = {
	listPlans: ListPlanParamsSchema,
	createPlan: CreatePlanParamsV2Schema,
	getPlan: GetPlanParamsV0Schema,
	// hasCustomers takes the same proposed-plan shape as updatePlan so it can
	// report whether applying it would create a new version.
	hasCustomers: UpdatePlanParamsV2Schema,
	updatePlan: UpdatePlanParamsV2Schema,
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
		operation({
			id: "hasCustomers",
			description:
				"Legacy lightweight version check for an existing plan. For catalog edits, use previewUpdateCatalog because it returns item changes, price changes, customer impact, variants, and versioning data.",
		}),
		operation({
			id: "updatePlan",
			description:
				"Update an existing Autumn plan. Destructive configuration write: prefer catalog.update for catalog changes and preview first with previewUpdateCatalog. If using updatePlan directly, set disable_version per Plan Management.",
			destructive: true,
		}),
	],
} satisfies ToolDomain;

export const plans = { endpoints, schemas, domain };
