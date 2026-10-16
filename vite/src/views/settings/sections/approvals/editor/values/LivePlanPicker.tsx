import type { FilterValueInputProps } from "@/components/filters/types";
import { PlanVersionPicker } from "@/views/migrations/migration/shared/PlanVersionPicker";
import { useApprovalsCatalog } from "../../useApprovalsCatalog";

/** Rules are live, so the plan picker offers live plans in any dashboard env. */
export const LivePlanPicker = (props: FilterValueInputProps) => {
	const { products } = useApprovalsCatalog();
	return <PlanVersionPicker {...props} products={products} />;
};
