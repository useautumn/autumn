import type { FullCustomer } from "@autumn/shared";
import { AdminHover } from "@/components/general/AdminHover";
import { Badge } from "@/components/ui/badge";
import { SelectEntity } from "@/views/customers/customer/components/customer-header/SelectEntity";
import { PlanTypeBadge } from "../../components/PlanTypeBadge";

export default function EditorTopSection({
	product,
	hideAdminHover,
	customer,
	entityId,
}: {
	product: any;
	hideAdminHover: boolean;
	customer: FullCustomer;
	entityId: string;
}) {
	return (
		<div className="flex pl-4 pr-10 flex-col gap-2">
			<div className="col-span-2 flex">
				<div className="flex flex-row items-baseline justify-start gap-2 w-full whitespace-nowrap">
					<AdminHover
						texts={[
							{
								key: "internal_product_id",
								value: product.internal_id!,
							},
							{
								key: "stripe_id",
								value: product.stripe_id || "N/A",
							},
							{
								key: "customer_product_id",
								value: product.cusProductId || "N/A",
							},
						]}
						hide={hideAdminHover}
					>
						<span className="text-lg font-medium w-fit whitespace-nowrap">
							{product.name}
						</span>
					</AdminHover>
					<span className="text-sm text-t3">v{product.version}</span>
				</div>
			</div>
			<div className="flex flex-row gap-2">
				<Badge variant="secondary">Add-on</Badge>
				<PlanTypeBadge product={product} />
			</div>
			{customer && (
				<SelectEntity entityId={entityId} entities={customer?.entities} />
			)}
		</div>
	);
}
