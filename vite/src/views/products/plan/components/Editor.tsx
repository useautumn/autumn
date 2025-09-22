import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useProductContext } from "@/views/products/product/ProductContext";
import EditorTopSection from "./EditorTopSection";
import PlanCard from "./PlanCard/PlanCard";

export const ManagePlan = ({
	hideAdminHover = false,
}: {
	hideAdminHover?: boolean;
}) => {
	const { customer } = useCusQuery();
	const { product, entityId } = useProductContext();

	return (
		<div className="flex flex-col gap-4 h-full overflow-hidden">
			<EditorTopSection
				product={product}
				hideAdminHover={hideAdminHover}
				customer={customer}
				entityId={entityId}
			/>

			<div className="flex flex-col gap-10 flex-1 min-h-0 bg-[#EEEEEE] items-center justify-center overflow-hidden">
				<PlanCard product={product} />
			</div>
		</div>
	);
};
