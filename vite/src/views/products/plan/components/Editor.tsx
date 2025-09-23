import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useProductContext } from "@/views/products/product/ProductContext";
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
			<div className="flex flex-col h-full bg-[#EEEEEE] items-center justify-start pt-20">
				<PlanCard product={product} />
			</div>
		</div>
	);
};
