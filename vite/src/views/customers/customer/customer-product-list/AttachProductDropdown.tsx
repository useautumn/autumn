import type { Entity, ProductV2 } from "@autumn/shared";
import { useCustomer } from "autumn-js/react";
import { Blend, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import SmallSpinner from "@/components/general/SmallSpinner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/hooks/common/useOrg";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getRedirectUrl, navigateTo } from "@/utils/genUtils";
import { AddProductContext } from "../add-product/CreateCheckoutContext";
import { useCustomerContext } from "../CustomerContext";
import { useCusQuery } from "../hooks/useCusQuery";

function AttachProductDropdown({
	setMultiAttachOpen,
}: {
	setMultiAttachOpen: (open: boolean) => void;
}) {
	const { env, entityId } = useCustomerContext();
	const { products, customer, entities } = useCusQuery();

	const axiosInstance = useAxiosInstance({ env });
	const { customer: autumnCustomer } = useCustomer();

	const [options, setOptions] = useState<any[]>([]);
	const [searchQuery, setSearchQuery] = useState("");
	const [open, setOpen] = useState(false);
	const { org } = useOrg();

	const filteredProducts = products.filter((product: ProductV2) => {
		if (product.archived) return false;
		if (product.is_add_on && !searchQuery) return true;

		const entity = entities.find((e: Entity) => e.id === entityId);

		// const customerHasProduct = customer.customer_products?.some((cp: any) => {
		// 	const idMatch = cp.product_id === product.id;
		// 	const entityIdMatch = entity
		// 		? cp.internal_entity_id === entity?.internal_id
		// 		: true;
		// 	const isAddOn = product.is_add_on;
		// 	const isActive = cp.status === CusProductStatus.Active;

		// 	return idMatch && entityIdMatch && isAddOn && isActive;
		// });

		return product.name.toLowerCase().includes(searchQuery.toLowerCase());
	});

	const navigate = useNavigate();

	const handleAddProduct = async (productId: string, setLoading: any) => {
		let stripeConnected = org?.stripe_connected;

		if (!stripeConnected) {
			const { data: org } = await OrgService.get(axiosInstance);
			stripeConnected = org?.stripe_connected;
		}

		if (!stripeConnected) {
			toast.error("Connect to Stripe to add products to customers");
			const redirectUrl = getRedirectUrl(`/customers/${customer.id}`, env);
			navigateTo(`/dev?tab=stripe`, navigate, env);
			return;
		}

		navigateTo(
			`/customers/${customer.id || customer.internal_id}/${productId}${
				entityId ? `?entity_id=${entityId}` : ""
			}`,
			navigate,
			env,
		);
	};

	return (
		<AddProductContext.Provider value={{ options, setOptions }}>
			<div className="relative w-full">
				<DropdownMenu open={open} onOpenChange={setOpen}>
					<DropdownMenuTrigger asChild>
						<Button variant="add">Attach Product</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						// className="w-[var(--radix-dropdown-menu-trigger-width)] p-0"
						className="w-fit max-w-xl whitespace-nowrap truncate max-h-[400px] overflow-y-auto"
						align="end"
					>
						<div className="flex items-center border-b px-2">
							<Search size={12} className="text-t3" />
							<Input
								type="search"
								placeholder="Search products"
								className="h-7 rounded-none shadow-none border-0 focus:ring-0 focus-visible:ring-0 focus:ring-offset-0 focus:outline-none focus-visible:border-none focus-visible:shadow-none"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
								autoFocus
							/>
						</div>
						{filteredProducts.length === 0 ? (
							<div className="py-2 px-3 text-sm text-t3">
								No new products found
							</div>
						) : (
							filteredProducts.map((product: ProductV2) => (
								<DropdownProductItem
									key={product.id}
									product={product}
									handleAddProduct={handleAddProduct}
								/>
							))
						)}
						{autumnCustomer?.features.multi_attach && (
							<DropdownMenuItem
								className="text-t2"
								onClick={() => setMultiAttachOpen(true)}
							>
								<div className="flex items-center gap-2 w-full text-t3 hover:text-t2">
									<Blend size={12} />
									<p>Multiple</p>
								</div>
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</AddProductContext.Provider>
	);
}

export default AttachProductDropdown;

const DropdownProductItem = ({
	product,
	handleAddProduct,
}: {
	product: ProductV2;
	handleAddProduct: any;
}) => {
	const [isLoading, setIsLoading] = useState(false);
	return (
		<DropdownMenuItem
			key={product.id}
			onClick={async (e) => {
				e.stopPropagation();
				e.preventDefault();

				await handleAddProduct(product.id, setIsLoading);
			}}
		>
			{isLoading && <SmallSpinner />}
			<div className="flex items-center gap-2">
				<span>{product.name}</span>
				<span className="text-t3">({product.id})</span>
			</div>
		</DropdownMenuItem>
	);
};
