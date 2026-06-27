import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import {
	Copy,
	EllipsisVerticalIcon,
	GitForkIcon,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { cn } from "@/lib/utils";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { pushPage } from "@/utils/genUtils";
import { CopyProductDialog } from "../../products/components/CopyProductDialog";
import { CreateVariantDialog } from "./CreateVariantDialog";
import { DeletePlanDialog } from "./DeletePlanDialog";

export const PlanToolbar = () => {
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [copyOpen, setCopyOpen] = useState(false);
	const [createVariantOpen, setCreateVariantOpen] = useState(false);
	const [isCreatingVariant, setIsCreatingVariant] = useState(false);
	const [variantId, setVariantId] = useState("");
	const [variantName, setVariantName] = useState("");
	const navigate = useNavigate();
	const axiosInstance = useAxiosInstance();
	const product = useProductStore((s) => s.product);
	const { invalidate: invalidateProducts } = useProductsQuery();
	const [dropdownOpen, setDropdownOpen] = useState(false);

	const isVariant = !!product.base_internal_product_id;

	const handleCreateVariant = async () => {
		if (!variantId.trim() || !variantName.trim()) {
			toast.error("Variant ID and name are required");
			return;
		}
		setIsCreatingVariant(true);
		try {
			await ProductService.createVariant(axiosInstance, {
				plan_id: product.id,
				id: variantId.trim(),
				name: variantName.trim(),
			});
			toast.success("Variant created");
			setCreateVariantOpen(false);
			setVariantId("");
			setVariantName("");
			await invalidateProducts();
			pushPage({
				navigate,
				path: `/products/${variantId.trim()}`,
				preserveParams: true,
			});
		} catch (error) {
			const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
			toast.error(message ?? "Failed to create variant");
		} finally {
			setIsCreatingVariant(false);
		}
	};

	return (
		<>
			<CopyProductDialog
				open={copyOpen}
				setOpen={setCopyOpen}
				product={product}
			/>
			<DeletePlanDialog
				open={deleteOpen}
				setOpen={setDeleteOpen}
				onDeleteSuccess={async () => {
					pushPage({
						navigate,
						path: "/products",
						queryParams: {
							tab: "products",
						},
						preserveParams: true,
					});
				}}
			/>
			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<DropdownMenuTrigger asChild>
					<IconButton
						icon={<EllipsisVerticalIcon />}
						variant="secondary"
						iconOrientation="center"
						className={cn("!h-6", dropdownOpen && "btn-secondary-active")}
					/>
				</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{!isVariant && (
					<DropdownMenuItem
						className="flex items-center text-xs"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							setDropdownOpen(false);
							setCreateVariantOpen(true);
						}}
					>
						<div className="flex items-center justify-between w-full gap-2">
							Create Variant
							<GitForkIcon size={12} className="text-tertiary-foreground" />
						</div>
					</DropdownMenuItem>
				)}
				<DropdownMenuItem
						className="flex items-center text-xs"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							setDropdownOpen(false);
							setCopyOpen(true);
						}}
					>
						<div className="flex items-center justify-between w-full gap-2">
							Copy
							<Copy size={12} className="text-tertiary-foreground" />
						</div>
					</DropdownMenuItem>
					<DropdownMenuItem
						className="flex items-center text-xs"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							setDropdownOpen(false);
							setDeleteOpen(true);
						}}
					>
						<div className="flex items-center justify-between w-full gap-2">
							Delete Plan
							<Trash2 size={12} className="text-tertiary-foreground" />
						</div>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{createVariantOpen && (
				<CreateVariantDialog
					open={createVariantOpen}
					setOpen={setCreateVariantOpen}
					variantId={variantId}
					setVariantId={setVariantId}
					variantName={variantName}
					setVariantName={setVariantName}
					isLoading={isCreatingVariant}
					onCreate={handleCreateVariant}
				/>
			)}
		</>
	);
};
