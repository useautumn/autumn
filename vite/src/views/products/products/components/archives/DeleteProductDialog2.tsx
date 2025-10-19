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
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const DeleteProductDialog = ({
	product,
	open,
	setOpen,
	onDeleteSuccess,
}: {
	product: ProductV2;
	open: boolean;
	setOpen: (open: boolean) => void;
	onDeleteSuccess?: () => Promise<void>;
}) => {
	const axiosInstance = useAxiosInstance();
	const [loading, setLoading] = useState(false);
	const [deleteAllVersions, setDeleteAllVersions] = useState(false);
	const { refetch: refetchProducts } = useProductsQuery();

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

			await refetchProducts();
			setOpen(false);

			if (onDeleteSuccess) {
				await onDeleteSuccess();
			}

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
			toast.success(`${product.name} archived successfully`);
			setOpen(false);
			if (onDeleteSuccess) {
				await onDeleteSuccess();
			}
			await refetchProducts();
		} catch (error: unknown) {
			toast.error(
				getBackendErr(error as AxiosError, "Error archiving product"),
			);
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
			await refetchProducts();
			if (onDeleteSuccess) {
				await onDeleteSuccess();
			}
			toast.success(`${product.name} unarchived successfully`);
			setOpen(false);
		} catch (error: unknown) {
			toast.error(
				getBackendErr(error as AxiosError, "Error unarchiving product"),
			);
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
			return `Are you sure you want to unarchive ${product.name}? This will make it visible in your list of products.`;
		}

		const isMultipleVersions = productInfo?.numVersion > 1;
		const versionText = deleteAllVersions ? "product" : "version";
		const productText = isMultipleVersions ? versionText : "product";

		const messageTemplates = {
			withCustomers: {
				single: (customerName: string, productText: string) =>
					`${customerName} is on this ${productText}. Are you sure you want to archive it?`,
				multiple: (
					customerName: string,
					otherCount: number,
					productText: string,
				) =>
					`${customerName} and ${otherCount} other customer${otherCount > 1 ? "s" : ""} are on this ${productText}. Are you sure you want to archive this product?`,
				fallback: (productText: string) =>
					`There are customers on this ${productText}. Deleting this ${productText} will remove it from their accounts. Are you sure you want to continue? You can also archive the product instead.`,
			},
			withoutCustomers: (productText: string) =>
				`Are you sure you want to delete this ${productText}? This action cannot be undone.`,
		};

		if (hasCusProducts) {
			if (productInfo?.customerName && productInfo?.totalCount) {
				const totalCount = Number.parseInt(productInfo.totalCount);

				if (Number.isNaN(totalCount) || totalCount <= 0) {
					return messageTemplates.withCustomers.fallback(productText);
				}
				if (totalCount === 1) {
					return messageTemplates.withCustomers.single(
						productInfo.customerName,
						productText,
					);
				}
				const otherCount = totalCount - 1;
				return messageTemplates.withCustomers.multiple(
					productInfo.customerName,
					otherCount,
					productText,
				);
			}
			return messageTemplates.withCustomers.fallback(productText);
		}
		return messageTemplates.withoutCustomers(productText);
	};

	if (!productInfo || isLoading) return null;

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
								<SelectItem value="all">Archive product</SelectItem>
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
