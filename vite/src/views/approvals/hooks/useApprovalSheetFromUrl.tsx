import { parseAsString, useQueryStates } from "nuqs";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { attachFormOverridesFromRequestBody } from "@/components/forms/attach-v2/utils/attachFormOverridesFromRequestBody";
import { updateSubscriptionFormOverridesFromRequestBody } from "@/components/forms/update-subscription-v2/utils/updateSubscriptionFormOverridesFromRequestBody";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useApprovalDetailQuery } from "./useApprovalDetailQuery";
import { useResolvedApprovalRequest } from "./useResolvedApprovalRequest";

const APPROVAL_SHEETS = ["attach-product", "subscription-update"] as const;
type ApprovalSheet = (typeof APPROVAL_SHEETS)[number];

const isApprovalSheet = (value: string | null): value is ApprovalSheet =>
	APPROVAL_SHEETS.includes((value ?? "") as ApprovalSheet);

/** Opens the native billing sheet from a Slack approval deep link:
 * `?sheet=attach-product&approval_id=…` — fetches the approval, resolves its
 * stored V1 request into the sheet's V0 dialect server-side, seeds the form
 * overrides, lands on the sheet, then strips the params. */
export const useApprovalSheetFromUrl = ({
	resolveSubscriptionItemId,
}: {
	/** FullCusProduct id for the plan the approval updates (client-resolved). */
	resolveSubscriptionItemId: (planId: string | null) => string | undefined;
}) => {
	const [params, setParams] = useQueryStates({
		approval_id: parseAsString,
		plan_id: parseAsString,
		sheet: parseAsString,
	});
	const setSheet = useSheetStore((state) => state.setSheet);
	const openedRef = useRef(false);

	const sheetType = isApprovalSheet(params.sheet) ? params.sheet : null;
	const { approval, approvalError } = useApprovalDetailQuery({
		approvalId: sheetType ? params.approval_id : null,
	});
	const { resolved, resolutionFailed, resolutionPending } =
		useResolvedApprovalRequest({ approval });

	useEffect(() => {
		if (!sheetType || openedRef.current) return;
		if (params.approval_id && !approval && !approvalError) return;
		if (resolutionPending) return;

		const mapOverrides =
			sheetType === "attach-product"
				? attachFormOverridesFromRequestBody
				: updateSubscriptionFormOverridesFromRequestBody;
		if (approval && resolutionFailed) {
			toast.warning("Couldn't prefill the form from the approval.");
		}
		const data = {
			approvalId: approval?.id ?? null,
			defaultOverrides:
				approval && resolved ? mapOverrides(resolved.request) : {},
		};

		if (sheetType === "attach-product") {
			openedRef.current = true;
			setSheet({ type: "attach-product", data });
		} else {
			const itemId = resolveSubscriptionItemId(
				approval?.plan_id ?? params.plan_id,
			);
			if (!itemId) return;
			openedRef.current = true;
			setSheet({ type: "subscription-update", itemId, data });
		}
		void setParams({ approval_id: null, plan_id: null, sheet: null });
	}, [
		approval,
		approvalError,
		params.approval_id,
		params.plan_id,
		resolutionFailed,
		resolutionPending,
		resolved,
		resolveSubscriptionItemId,
		setParams,
		setSheet,
		sheetType,
	]);
};
