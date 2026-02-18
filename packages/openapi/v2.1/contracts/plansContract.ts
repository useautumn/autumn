import { ApiPlanV1Schema } from "@api/products/apiPlanV1.js";
import { ListPlanParamsSchema } from "@api/products/crud/listPlanParams.js";
import { oc } from "@orpc/contract";
import { z } from "zod/v4";

export const listPlansContract = oc
	.route({
		method: "POST",
		path: "/v1/plans.list",
		operationId: "listPlans",
		summary: "List all plans",
		tags: ["plans"],
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "list",
		}),
	})
	.input(ListPlanParamsSchema)
	.output(
		z.object({
			list: z.array(ApiPlanV1Schema),
		}),
	);
