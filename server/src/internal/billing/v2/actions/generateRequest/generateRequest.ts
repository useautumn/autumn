import type { AttachParamsV0 } from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import { z } from "zod/v4";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	ResolveBillingRequestParamsSchema,
	type ResolvedBillingRequestV0,
	resolveBillingRequest,
} from "@/internal/billing/v2/actions/resolveBillingRequest";
import {
	composeMultiAttachRequest,
	type GeneratedMultiAttachRequestV0,
} from "./compute/composeMultiAttachRequest";
import { computeGeneratedParams } from "./compute/computeGeneratedParams";
import { assertNoDuplicateAddItems } from "./compute/validateGeneratedAddItems";
import type { GenerateBillingRequestParams } from "./generationSchemas";
import { setupGenerationContext } from "./setup/setupGenerationContext";

/** Attach requests keep an explicit `entity_id: null` — the sheet reads it as
 * "clear the entity anchor", unlike an omitted key. */
export type GeneratedBillingRequestV0 =
	| ResolvedBillingRequestV0
	| GeneratedMultiAttachRequestV0
	| (Omit<AttachParamsV0, "entity_id"> & { entity_id?: string | null });

export const generateRequest = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: GenerateBillingRequestParams;
}): Promise<{
	request: GeneratedBillingRequestV0;
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

	if ("additional_plans" in generated && generated.additional_plans?.length) {
		return composeMultiAttachRequest({
			ctx,
			customerId: params.customer_id,
			generated,
		});
	}

	const explicitEntityScope =
		"entity_id" in generated ? generated.entity_id : undefined;
	const anchoredEntityId =
		params.tool === "update_subscription" &&
		typeof params.current_request?.entity_id === "string"
			? params.current_request.entity_id
			: undefined;
	const injected = {
		...generated,
		...(explicitEntityScope === null ? { entity_id: undefined } : {}),
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
		return {
			request: {
				...(resolved.request as AttachParamsV0),
				entity_id: explicitEntityScope,
			},
			unrepresentable: resolved.unrepresentable,
		};
	}
	return resolved;
};
