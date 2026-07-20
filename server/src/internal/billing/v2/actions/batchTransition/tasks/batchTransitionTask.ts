import { AppEnv, CustomerLicenseTransitionSchema } from "@autumn/shared";
import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { runWithTriggerContext } from "@/trigger/utils/runWithTriggerContext.js";
import { batchTransition } from "../batchTransition.js";

const BatchTransitionTaskPayloadSchema = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	customerId: z.string().optional(),
	transition: CustomerLicenseTransitionSchema,
	executionScope: z.object({
		batchTransitionId: z.string().min(1),
		assignmentCutoffMs: z.number().int().nonnegative(),
	}),
});

type BatchTransitionTaskPayload = z.infer<
	typeof BatchTransitionTaskPayloadSchema
>;

export const batchTransitionTask = task({
	id: "batch-transition",
	maxDuration: 1_800,
	run: async (raw: BatchTransitionTaskPayload, { ctx: triggerCtx }) => {
		const { orgId, env, customerId, transition, executionScope } =
			BatchTransitionTaskPayloadSchema.parse(raw);
		return runWithTriggerContext({
			orgId,
			env,
			triggerCtx,
			customerId,
			args: { transition, executionScope },
			action: batchTransition,
		});
	},
});
