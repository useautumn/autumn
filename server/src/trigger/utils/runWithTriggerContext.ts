import type { AppEnv } from "@autumn/shared";
import type { Context as TriggerRunContext } from "@trigger.dev/sdk/v3";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { logContextExtras } from "@/utils/logging/logContextExtras.js";
import { createTriggerContext } from "./createTriggerContext.js";

export const runWithTriggerContext = async <TArgs extends object, TResult>({
	orgId,
	env,
	triggerCtx,
	customerId,
	args,
	action,
}: {
	orgId: string;
	env: AppEnv;
	triggerCtx: TriggerRunContext;
	customerId?: string;
	args: TArgs;
	action: (params: TArgs & { ctx: AutumnContext }) => Promise<TResult>;
}): Promise<TResult> => {
	const { ctx } = await createTriggerContext({
		orgId,
		env,
		triggerCtx,
		customerId,
	});
	let status: "success" | "error" = "success";

	try {
		return await action({ ...args, ctx });
	} catch (error) {
		status = "error";
		throw error;
	} finally {
		logContextExtras({
			ctx,
			message: `[${triggerCtx.task.id}] Finished`,
			status,
		});
	}
};
