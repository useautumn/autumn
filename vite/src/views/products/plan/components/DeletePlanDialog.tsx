import type { ProductV2 } from "@autumn/shared";
import type { AxiosError } from "axios";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useGeneralQuery } from "@/hooks/queries/useGeneralQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useProductQuery } from "../../product/hooks/useProductQuery";

export const DeletePlanDialog = ({
	propProduct,
	open,
	setOpen,
	onDeleteSuccess,
}: {
	propProduct?: ProductV2;
	open: boolean;
	setOpen: (open: boolean) => void;
	onDeleteSuccess?: () => Promise<void>;
}) => {
	const axiosInstance = useAxiosInstance();
	const storeProduct = useProductStore((s) => s.product);

	let product: ProductV2;
	if (propProduct) {
		product = propProduct;
	} else {
		product = storeProduct;
	}

	const [loading, setLoading] = useState(false);
	const [deleteAllVersions, setDeleteAllVersions] = useState(false);
	const { invalidate: invalidateProducts } = useProductsQuery();
	const { invalidate: invalidateProduct, refetch: refetchProduct } =
		useProductQuery();

	const { data: productInfo, isLoading } = useGeneralQuery({
		url: `/products/${product.id}/info`,
		queryKey: ["productInfo", product.id],
		enabled: open,
	});

	const handleDelete = async () => {
		setLoading(true);
		try {
			await ProductService.deleteProduct(
				axiosInstance,
				product.id,
				deleteAllVersions,
			);

			await Promise.all([invalidateProducts(), invalidateProduct()]);

			// Call onDeleteSuccess callback if provided (for onboarding)
			if (onDeleteSuccess) {
				await onDeleteSuccess();
			}

			setOpen(false);
			toast.success("Product deleted successfully");
		} catch (error: unknown) {
			toast.error(getBackendErr(error as AxiosError, "Error deleting product"));
		} finally {
			setLoading(false);
		}
	};

	const handleArchive = async () => {
		setLoading(true);
		try {
			await ProductService.updateProduct(axiosInstance, product.id, {
				archived: true,
			});

			if (onDeleteSuccess) {
				await onDeleteSuccess();
			}
			toast.success(`${product.name} archived successfully`);
			setOpen(false);
			await Promise.all([invalidateProducts(), invalidateProduct()]);
		} catch (error) {
			toast.error(getBackendErr(error, "Error archiving product"));
		} finally {
			setLoading(false);
		}
	};

	const handleUnarchive = async () => {
		setLoading(true);
		try {
			await ProductService.updateProduct(axiosInstance, product.id, {
				archived: false,
			});

			if (onDeleteSuccess) {
				await onDeleteSuccess();
			}
			await refetchProduct();
			toast.success(`${product.name} unarchived successfully`);
			setOpen(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Error unarchiving product"));
		} finally {
			setLoading(false);
		}
	};

	const hasCusProductsAll = productInfo?.hasCusProducts;
	const hasCusProductsLatest = productInfo?.hasCusProductsLatest;

	const hasCusProducts = deleteAllVersions
		? hasCusProductsAll
		: hasCusProductsLatest;

	const getDeleteMessage = () => {
		if (product.archived) {
			return `Are you sure you want to unarchive ${product.name}? This will make it visible in your list of plans.`;
		}

		// \n\nNote: If there are multiple versions, this will unarchive all versions at once.

		const isMultipleVersions = productInfo?.numVersion > 1;
		const versionText = deleteAllVersions ? "plan" : "version";
		const productText = isMultipleVersions ? versionText : "plan";

		const messageTemplates = {
			withCustomers: {
				single: (customerName: string, productText: string) =>
					`${customerName} is on this ${productText}. Are you sure you want to archive it?`,
				multiple: (
					customerName: string,
					otherCount: number,
					productText: string,
				) =>
					`${customerName} and ${otherCount} other customer${otherCount > 1 ? "s" : ""} are on this ${productText}. Are you sure you want to archive this plan?`,
				fallback: (productText: string) =>
					`There are customers on this ${productText}. Deleting this ${productText} will remove it from their accounts. Are you sure you want to continue? You can also archive the plan instead.`,
			},
			withoutCustomers: (productText: string) =>
				`Are you sure you want to delete this ${productText}? This action cannot be undone.`,
		};

		if (hasCusProducts) {
			if (productInfo?.customerName && productInfo?.totalCount) {
				const totalCount = parseInt(productInfo.totalCount);

				if (Number.isNaN(totalCount) || totalCount <= 0) {
					return messageTemplates.withCustomers.fallback(productText);
				} else if (totalCount === 1) {
					return messageTemplates.withCustomers.single(
						productInfo.customerName,
						productText,
					);
				} else {
					const otherCount = totalCount - 1;
					return messageTemplates.withCustomers.multiple(
						productInfo.customerName,
						otherCount,
						productText,
					);
				}
			} else {
				return messageTemplates.withCustomers.fallback(productText);
			}
		} else {
			return messageTemplates.withoutCustomers(productText);
		}
	};

	if (!productInfo || isLoading) return;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent onClick={(e) => e.stopPropagation()}>
				<DialogHeader className="max-w-full">
					<DialogTitle className="truncate max-w-[400px]">
						{product.archived
							? "Unarchive"
							: hasCusProducts
								? "Archive"
								: "Delete"}{" "}
						{product.name}
					</DialogTitle>
					<DialogDescription className="max-w-[400px] break-words">
						{getDeleteMessage()
							.split("\n")
							.map((line, index) => (
								<span key={index}>
									{line}
									{index < getDeleteMessage().split("\n").length - 1 && <br />}
								</span>
							))}
					</DialogDescription>
				</DialogHeader>

				{productInfo.numVersion > 1 &&
					!product.archived &&
					!productInfo.hasCusProductsLatest && (
						<Select
							value={deleteAllVersions ? "all" : "latest"}
							onValueChange={(value) => setDeleteAllVersions(value === "all")}
						>
							<SelectTrigger className="w-6/12">
								<SelectValue placeholder="Select a version" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="latest">Delete latest version</SelectItem>
								<SelectItem value="all">Archive plan</SelectItem>
							</SelectContent>
						</Select>
					)}

				<DialogFooter>
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					{product.archived && (
						<Button
							variant="primary"
							onClick={handleUnarchive}
							isLoading={loading}
						>
							Unarchive
						</Button>
					)}
					{hasCusProducts && !product.archived && (
						<Button
							variant="primary"
							onClick={handleArchive}
							isLoading={loading}
						>
							Archive
						</Button>
					)}

					{!hasCusProducts && !product.archived && (
						<Button
							variant="destructive"
							onClick={handleDelete}
							isLoading={loading}
						>
							Delete
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
