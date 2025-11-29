import type { Entity } from "@autumn/shared";
import { useNavigate } from "react-router";
import { AdminHover } from "@/components/general/AdminHover";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

export const CustomerBreadcrumbs = () => {
	const env = useEnv();
	const navigate = useNavigate();

	const { customer } = useCusQuery();
	const { entityId, setEntityId } = useEntity();

	const entity = customer.entities.find((e: Entity) => e.id === entityId);

	return (
		<Breadcrumb className="text-t3 flex justify-start ">
			<BreadcrumbList className="text-t3 text-xs">
				<BreadcrumbItem>
					<BreadcrumbLink
						className="cursor-pointer"
						onClick={() => navigateTo("/customers", navigate, env)}
					>
						<AdminHover
							texts={[
								{
									key: "Internal ID",
									value: customer.internal_id,
								},
								{
									key: "Stripe ID",
									value: customer.processor?.id,
								},
								{
									key: "Entities",
									value: (customer.entities || [])
										.map((e: Entity) => e.id)
										.join(", "),
								},
							]}
						>
							Customers
						</AdminHover>
					</BreadcrumbLink>
				</BreadcrumbItem>
				<BreadcrumbSeparator />
				<BreadcrumbItem className="truncate max-w-36">
					{entityId ? (
						<BreadcrumbLink
							className="cursor-pointer"
							onClick={() => {
								setEntityId(null);
							}}
						>
							{customer.name || customer.id || customer.email}
						</BreadcrumbLink>
					) : (
						<span className="truncate">
							{customer.name || customer.id || customer.email}
						</span>
					)}
				</BreadcrumbItem>
				{entityId && (
					<>
						<BreadcrumbSeparator />
						<BreadcrumbItem className="truncate max-w-36">
							{entity?.name || entityId}
						</BreadcrumbItem>
					</>
				)}
			</BreadcrumbList>
		</Breadcrumb>
	);
};
