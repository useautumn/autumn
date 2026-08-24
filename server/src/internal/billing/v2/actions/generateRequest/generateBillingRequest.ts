import { ErrCode, RecaseError } from "@autumn/shared";
import { z } from "zod/v4";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	ResolveBillingRequestParamsSchema,
	resolveBillingRequest,
} from "@/internal/billing/v2/actions/resolveBillingRequest";
import { composeMultiAttachRequest } from "./composeMultiAttachRequest";
import { generateBillingParams } from "./generateBillingParams";
import { buildGenerationContext } from "./generationContext";
import type { GenerateBillingTool } from "./generationSchemas";

export type GenerateBillingRequestParams = {
	tool: GenerateBillingTool;
	prompt: string;
	customer_id: string;
	customer_product_id?: string;
	current_request?: Record<string, unknown>;
};

export const generateBillingRequest = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: GenerateBillingRequestParams;
}): Promise<{
	request: Record<string, unknown>;
	unrepresentable: string[];
}> => {
	const { context } = await buildGenerationContext({
		ctx,
		customerId: params.customer_id,
	});

	const {
		params: generated,
		repaired,
		repairReason,
		salvaged,
	} = await generateBillingParams({
		context,
		currentRequest: params.current_request,
		prompt: params.prompt,
		tool: params.tool,
	});
	if (repaired) {
		ctx.logger.warn(
			{ repairReason, tool: params.tool },
			"[GenerateBillingRequest] first generation attempt failed, repaired on retry",
		);
	}
	if (salvaged) {
		ctx.logger.warn(
			{ tool: params.tool },
			"[GenerateBillingRequest] output decoded via salvage — new model output convention worth an eval case",
		);
	}

	if (
		params.tool === "attach" &&
		Array.isArray(generated.additional_plans) &&
		generated.additional_plans.length > 0
	) {
		return composeMultiAttachRequest({
			ctx,
			customerId: params.customer_id,
			generated,
		});
	}

	const explicitEntityScope = generated.entity_id;
	if (generated.entity_id === null) {
		delete generated.entity_id;
	}

	const injected = {
		...generated,
		customer_id: params.customer_id,
		...(params.tool === "update_subscription" && params.customer_product_id
			? { customer_product_id: params.customer_product_id }
			: {}),
	};

	const parsedResolveParams = ResolveBillingRequestParamsSchema.safeParse({
		request: injected,
		tool: params.tool,
	});
	if (!parsedResolveParams.success) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: `Generated billing request failed validation: ${z.prettifyError(parsedResolveParams.error)}`,
			statusCode: 400,
		});
	}

	const resolved = await resolveBillingRequest({
		ctx,
		params: parsedResolveParams.data,
	});
	if (params.tool === "attach" && explicitEntityScope !== undefined) {
		resolved.request.entity_id = explicitEntityScope;
	}
	return resolved;
};
