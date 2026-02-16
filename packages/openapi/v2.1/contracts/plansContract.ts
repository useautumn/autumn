import { ApiPlanV1Schema } from "@api/products/apiPlanV1.js";
import { oc } from "@orpc/contract";
import { z } from "zod/v4";

const listPlansRoute = {
	method: "GET",
	path: "/v1/products",
	operationId: "list",
	summary: "List Plans",
	tags: ["plans"],
} as const;

export const listPlansContract = oc
	.route(listPlansRoute)
	.input(z.object({}))
	.output(
		z.object({
			list: z.array(ApiPlanV1Schema),
		}),
	);
