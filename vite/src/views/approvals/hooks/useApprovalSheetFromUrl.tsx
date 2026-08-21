import { parseAsString, useQueryStates } from "nuqs";
import { useEffect, useRef } from "react";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import {
	attachOverridesFromParams,
	updateSubscriptionOverridesFromParams,
} from "../utils/approvalPrefill";
import { useApprovalDetailQuery } from "./useApprovalDetailQuery";

const APPROVAL_SHEETS = ["attach-product", "subscription-update"] as const;
type ApprovalSheet = (typeof APPROVAL_SHEETS)[number];

const isApprovalSheet = (value: string | null): value is ApprovalSheet =>
	APPROVAL_SHEETS.includes((value ?? "") as ApprovalSheet);

/** Opens the native billing sheet from a Slack approval deep link:
 * `?sheet=attach-product&approval_id=…` — fetches the approval, seeds the
 * form overrides, lands on the sheet, then strips the params. */
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

	useEffect(() => {
		if (!sheetType || openedRef.current) return;
		if (params.approval_id && !approval && !approvalError) return;

		const request =
			(approval?.steps[0]?.params.request as
				| Record<string, unknown>
				| undefined) ?? {};
		if (sheetType === "attach-product") {
			openedRef.current = true;
			setSheet({
				type: "attach-product",
				data: {
					approvalId: approval?.id ?? null,
					defaultOverrides: approval ? attachOverridesFromParams(request) : {},
				},
			});
		} else {
			const itemId = resolveSubscriptionItemId(
				approval?.plan_id ?? params.plan_id,
			);
			if (!itemId) return;
			openedRef.current = true;
			setSheet({
				type: "subscription-update",
				itemId,
				data: {
					approvalId: approval?.id ?? null,
					defaultOverrides: approval
						? updateSubscriptionOverridesFromParams(request)
						: {},
				},
			});
		}
		void setParams({ approval_id: null, plan_id: null, sheet: null });
	}, [
		approval,
		approvalError,
		params.approval_id,
		params.plan_id,
		resolveSubscriptionItemId,
		setParams,
		setSheet,
		sheetType,
	]);

	return { approval, approvalError };
};
