import { IconButton } from "@autumn/ui";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { parseAsString, useQueryStates } from "nuqs";
import { useNavigate } from "react-router";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { pushPage } from "@/utils/genUtils";

/**
 * Shown on a license's editor page only when arrived from a plan (the `fromPlan`
 * query param, set by the license card's nav arrow). Navigates back to that plan.
 */
export const BackToPlanButton = () => {
	const navigate = useNavigate();
	const [{ fromPlan }] = useQueryStates({ fromPlan: parseAsString });
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
					preserveParams: false,
				})
			}
		>
			Back to {planName ?? "plan"}
		</IconButton>
	);
};
