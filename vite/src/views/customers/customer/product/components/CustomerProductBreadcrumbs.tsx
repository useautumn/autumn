import { useNavigate } from "react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { navigateTo, pushPage } from "@/utils/genUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { useCusQuery } from "../../hooks/useCusQuery";

export const CustomerProductBreadcrumbs = () => {
	const { customer } = useCusQuery();
	const { product, entityId } = useProductContext();
	const navigation = useNavigate();

	return (
		<Breadcrumb className="text-t3 pt-6 pl-10 flex justify-center">
			<BreadcrumbList className="text-t3 text-xs w-full">
				<BreadcrumbItem>
					<BreadcrumbLink
						className="cursor-pointer"
						onClick={() => navigateTo("/customers", navigation)}
					>
						Customers
					</BreadcrumbLink>
				</BreadcrumbItem>
				<BreadcrumbSeparator />
				<BreadcrumbLink
					className="cursor-pointer truncate max-w-48"
					onClick={() =>
						pushPage({
							path: `/customers/${customer.id || customer.internal_id}`,
							navigate: navigation,
							queryParams: {
								entity_id: entityId,
							},
						})
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
