import { IconButton } from "@autumn/ui";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useNavigate } from "react-router";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { pushPage } from "@/utils/genUtils";
import { parentPlanEditorQueryParams } from "./planLicenseNavigation";

/**
 * Shown on a license's editor page only when arrived from a plan (the `fromPlan`
 * query param, set by the license card's nav arrow). Navigates back to that plan.
 */
export const BackToPlanButton = () => {
	const navigate = useNavigate();
	const [{ fromPlan, fromPlanVersion }] = useQueryStates({
		fromPlan: parseAsString,
		fromPlanVersion: parseAsInteger,
	});
	const { products } = useProductsQuery();

	if (!fromPlan) return null;

	const planName = products.find((p) => p.id === fromPlan)?.name;

	return (
		<IconButton
			variant="secondary"
			iconOrientation="left"
			icon={<ArrowLeftIcon />}
			size="mini"
			aria-label="Back to plan"
			onClick={() =>
				pushPage({
					navigate,
					path: `/products/${fromPlan}`,
					queryParams: parentPlanEditorQueryParams({
						parentVersion: fromPlanVersion,
					}),
					preserveParams: false,
				})
			}
		>
			Back to {planName ?? "plan"}
		</IconButton>
	);
};
