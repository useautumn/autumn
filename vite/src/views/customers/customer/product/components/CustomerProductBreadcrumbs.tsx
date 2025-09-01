import { useNavigate } from "react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { useProductContext } from "@/views/products/product/ProductContext";

export const CustomerProductBreadcrumbs = () => {
	const env = useEnv();
	const { customer, product, entityId } = useProductContext();
	const navigation = useNavigate();

	return (
		<Breadcrumb className="text-t3 pt-6 pl-10 flex justify-center">
			<BreadcrumbList className="text-t3 text-xs w-full">
				<BreadcrumbItem>
					<BreadcrumbLink
						className="cursor-pointer"
						onClick={() => navigateTo("/customers", navigation, env)}
					>
						Customers
					</BreadcrumbLink>
				</BreadcrumbItem>
				<BreadcrumbSeparator />
				<BreadcrumbLink
					className="cursor-pointer truncate max-w-48"
					onClick={() =>
						navigateTo(
							`/customers/${customer.id || customer.internal_id}${
								entityId ? `?entity_id=${entityId}` : ""
							}`,
							navigation,
							env,
						)
					}
				>
					{customer.name
						? customer.name
						: customer.id
							? customer.id
							: customer.email}
				</BreadcrumbLink>
				<BreadcrumbSeparator />
				<BreadcrumbItem>{product.name}</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>
	);
};
