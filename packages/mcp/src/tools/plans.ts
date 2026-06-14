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
				"Check the impact of updating an existing plan. Send the proposed plan (plan_id + the changes you intend to apply); returns current_version, will_version (true if the change differs from the live plan AND the plan has customers, so updating would create a new version), and archived. Call before updatePlan to decide disable_version. Follow Plan Management.",
		}),
		operation({
			id: "updatePlan",
			description:
				"Update an existing Autumn plan. Destructive configuration write: call hasCustomers first with the same proposed plan, then set disable_version per Plan Management (true applies to all current customers; omit to version and grandfather them). Follow Plan Management and Concepts.",
			destructive: true,
		}),
	],
} satisfies ToolDomain;

export const plans = { endpoints, schemas, domain };
