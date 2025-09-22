import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useProductContext } from "@/views/products/product/ProductContext";
import EditorTopSection from "./EditorTopSection";
import PlanCard from "./PlanCard";

export const ManagePlan = ({
	hideAdminHover = false,
}: {
	hideAdminHover?: boolean;
}) => {
	const { customer } = useCusQuery();
	const { product, entityId } = useProductContext();

	return (
		<div className="flex flex-col gap-4 ">
			<EditorTopSection
				product={product}
				hideAdminHover={hideAdminHover}
				customer={customer}
				entityId={entityId}
			/>

			<div className="flex flex-col gap-10 h-full bg-[#EEEEEE] min-h-screen items-center justify-center">
				<PlanCard product={product} />
			</div>
		</div>
	);
};
