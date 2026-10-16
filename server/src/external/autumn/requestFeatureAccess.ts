import { createFeatureAccess } from "@autumn/billing";
import { getAutumnEnv } from "@autumn/env";
import { onAwsEcs } from "@/external/aws/ecs/onAwsEcs.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getBillingAutumnClient } from "./getBillingAutumnClient.js";

/** What Autumn's own billing lets this request's org use, logged and overridden per request. */
export const requestFeatureAccess = ({ ctx }: { ctx: AutumnContext }) =>
	createFeatureAccess({
		ctx: {
			autumn: getBillingAutumnClient(),
			logger: ctx.logger,
			runtimeEnv: process.env,
			overrides: ctx.testOptions?.billingFeatures,
			// Autumn's own Atom is private to prod's VPC, so only ECS tasks reach it.
			useEdge: onAwsEcs() && Boolean(getAutumnEnv().AUTUMN_EDGE_URL),
		},
	});
