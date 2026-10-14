import type { AttachParamsV1, SetupPaymentParamsV1 } from "@autumn/shared";

export const setupPaymentToAttachParams = ({
	params,
}: {
	params: SetupPaymentParamsV1;
}): AttachParamsV1 => ({
	...params,
	plan_id: params.plan_id as string,
	redirect_mode: "if_required",
});
