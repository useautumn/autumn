import { parseAsString, useQueryStates } from "nuqs";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { attachFormOverridesFromRequestBody } from "@/components/forms/attach-v2/utils/attachFormOverridesFromRequestBody";
import { updateSubscriptionFormOverridesFromRequestBody } from "@/components/forms/update-subscription-v2/utils/updateSubscriptionFormOverridesFromRequestBody";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useApprovalSeedStore } from "../stores/useApprovalSeedStore";
import { useApprovalDetailQuery } from "./useApprovalDetailQuery";
import { useResolvedApprovalRequest } from "./useResolvedApprovalRequest";

const APPROVAL_SHEETS = ["attach-product", "subscription-update"] as const;
type ApprovalSheet = (typeof APPROVAL_SHEETS)[number];

const isApprovalSheet = (value: string | null): value is ApprovalSheet =>
	APPROVAL_SHEETS.includes((value ?? "") as ApprovalSheet);

/** Opens a billing sheet from a Slack approval deep link: resolves the stored
 * V1 request to V0 server-side, seeds the form overrides, strips the params. */
export const useApprovalSheetFromUrl = ({
	resolveSubscriptionItemId,
}: {
	resolveSubscriptionItemId: (planId: string | null) => string | undefined;
}) => {
	const [params, setParams] = useQueryStates({
		approval_id: parseAsString,
		plan_id: parseAsString,
		sheet: parseAsString,
	});
	const setSheet = useSheetStore((state) => state.setSheet);
	const setApprovalId = useApprovalSeedStore((state) => state.setApprovalId);
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
		const cancelAction = resolved?.request.cancel_action;
		if (approval && resolutionFailed) {
			toast.warning("Couldn't prefill the form from the approval.");
		}
		if (approval && approval.status !== "pending") {
			toast.warning(
				`This Slack request was already ${approval.status === "cancelled" ? "withdrawn" : approval.status} — applying here runs a new action.`,
			);
		}
		setApprovalId(approval?.id ?? null);
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
			// A cancel request is a different decision than a plan edit — route it
			// to the dashboard's native cancel flow.
			const type =
				cancelAction === "cancel_immediately" ||
				cancelAction === "cancel_end_of_cycle"
					? "subscription-cancel"
					: "subscription-update";
			setSheet({ type, itemId, data });
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
		setApprovalId,
		setParams,
		setSheet,
		sheetType,
	]);
};
