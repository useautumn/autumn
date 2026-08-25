import { ErrCode, RecaseError } from "@autumn/shared";
import { z } from "zod/v4";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	ResolveBillingRequestParamsSchema,
	resolveBillingRequest,
} from "@/internal/billing/v2/actions/resolveBillingRequest";
import { composeMultiAttachRequest } from "./compute/composeMultiAttachRequest";
import { computeGeneratedParams } from "./compute/computeGeneratedParams";
import { assertNoDuplicateAddItems } from "./compute/validateGeneratedAddItems";
import type { GenerateBillingRequestParams } from "./generationSchemas";
import { setupGenerationContext } from "./setup/setupGenerationContext";

export const generateRequest = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: GenerateBillingRequestParams;
}): Promise<{
	request: Record<string, unknown>;
	unrepresentable: string[];
}> => {
	const { context } = await setupGenerationContext({
		ctx,
		customerId: params.customer_id,
	});

	const {
		params: generated,
		repaired,
		repairReason,
		salvaged,
	} = await computeGeneratedParams({
		context,
		currentRequest: params.current_request,
		prompt: params.prompt,
		tool: params.tool,
		validate: (candidate) =>
			assertNoDuplicateAddItems({
				context,
				customerProductId: params.customer_product_id,
				generated: candidate,
				tool: params.tool,
			}),
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
		"additional_plans" in generated &&
		generated.additional_plans !== undefined &&
		generated.additional_plans.length > 0
	) {
		return composeMultiAttachRequest({
			ctx,
			customerId: params.customer_id,
			generated,
		});
	}

	const explicitEntityScope =
		"entity_id" in generated ? generated.entity_id : undefined;
	if ("entity_id" in generated && generated.entity_id === null) {
		delete generated.entity_id;
	}

	const anchoredEntityId =
		params.tool === "update_subscription" &&
		typeof params.current_request?.entity_id === "string"
			? params.current_request.entity_id
			: undefined;
	const injected = {
		...generated,
		customer_id: params.customer_id,
		...(params.tool === "update_subscription" && params.customer_product_id
			? { customer_product_id: params.customer_product_id }
			: {}),
		...(anchoredEntityId ? { entity_id: anchoredEntityId } : {}),
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
