import { AdminHover } from "@/components/general/AdminHover";
import {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { useNavigate, useLocation } from "react-router";
import { useCustomerContext } from "../../CustomerContext";
import { useCusQuery } from "../../hooks/useCusQuery";

export const CustomerBreadcrumbs = () => {
	const env = useEnv();
	const navigate = useNavigate();
	const location = useLocation();

	const { customer } = useCusQuery();
	const { entityId, setEntityId } = useCustomerContext();

	const entity = customer.entities.find((e: any) => e.id === entityId);

	return (
		<Breadcrumb className="text-t3 pl-10 flex justify-start ">
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
										.map((e: any) => e.id)
										.join(", "),
								},
							]}
						>
							Customers
						</AdminHover>
					</BreadcrumbLink>
				</BreadcrumbItem>
				<BreadcrumbSeparator />
				<BreadcrumbItem className="truncate max-w-48">
					{entityId ? (
						<BreadcrumbLink
							className="cursor-pointer"
							onClick={() => {
								setEntityId(null);
								const params = new URLSearchParams(location.search);
								params.delete("entity_id");
								navigate(`${location.pathname}?${params.toString()}`);
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
						<BreadcrumbItem className="truncate max-w-48">
							{entity?.name || entityId}
						</BreadcrumbItem>
					</>
				)}
			</BreadcrumbList>
		</Breadcrumb>
	);
};
