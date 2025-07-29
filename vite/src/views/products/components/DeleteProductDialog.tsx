import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

import { DialogTrigger } from "@/components/ui/dialog";
import { AppEnv, Product } from "@autumn/shared";
import { useProductsContext } from "../ProductsContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { useState } from "react";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { ToggleButton } from "@/components/general/ToggleButton";
import { useEnv } from "@/utils/envUtils";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { getBackendErr } from "@/utils/genUtils";
import { toast } from "sonner";

export const DeleteProductDialog = ({
	product,
	open,
	setOpen,
}: {
	product: Product;
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const { mutate } = useProductsContext();
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [archiveLoading, setArchiveLoading] = useState(false);
	const axiosInstance = useAxiosInstance();
	const env = useEnv();

	const { data: productInfo, isLoading } = useAxiosSWR({
		url: `/products/${product.id}/info`,
		options: {
			refreshInterval: 0,
		},
	});

	const [deleteAllVersions, setDeleteAllVersions] = useState(false);

	const handleDelete = async () => {
		if (archiveLoading) return;
		setDeleteLoading(true);
		try {
			await ProductService.deleteProduct(axiosInstance, product.id);
			await mutate();
			setOpen(false);
		} catch (error) {
			console.error("Error deleting product:", error);
			toast.error(getBackendErr(error, "Error deleting product"));
		} finally {
			setDeleteLoading(false);
		}
	};

	const handleArchive = async () => {
		setArchiveLoading(true);
		try {
			if(!deleteAllVersions) {
				await ProductService.updateProduct(axiosInstance, product.id, {
					archived: true,
				});
			} else {
				for(let i = 0; i < productInfo.numVersion; i++) {
					await ProductService.updateProduct(axiosInstance, product.id, {
						archived: true,
						version: i,
					});
				}
			}
			await mutate();
			toast.success(`Product ${product.name} archived successfully`);
			setOpen(false);
		} catch (error) {
			console.error("Error archiving product:", error);
			toast.error(getBackendErr(error, "Error archiving product"));
		} finally {
			setArchiveLoading(false);
		}
	};

	const hasCusProductsAll = productInfo?.hasCusProducts;
	const hasCusProductsLatest = productInfo?.hasCusProductsLatest;

	const hasCusProducts = deleteAllVersions
		? hasCusProductsAll
		: hasCusProductsLatest;

	const getDeleteMessage = () => {
		const isMultipleVersions = productInfo?.numVersion > 1;
		const versionText = deleteAllVersions ? "product" : "version";
		const productText = isMultipleVersions ? versionText : "product";
		
		if (env == AppEnv.Live) {
			if (hasCusProducts) {
				return `There are customers on this ${productText}. Please delete them first before deleting the ${productText}. Would you like to archive the product instead?`;
			} else {
				return `Are you sure you want to delete this ${productText}? This action cannot be undone. You can also archive the ${productText} instead.`;
			}
		} else {
			if (hasCusProducts) {
				return `There are customers on this ${productText}. Deleting this ${productText} will remove it from any customers. Are you sure you want to continue? You can also archive the product instead.`;
			} else {
				return `Are you sure you want to delete this ${productText}? This action cannot be undone.`;
			}
		}
	};

	if (!productInfo) {
		return <></>;
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent
				className="w-md"
				onClick={(e) => e.stopPropagation()}
			>
				<DialogHeader>
					<DialogTitle>Delete {product.name}</DialogTitle>
				</DialogHeader>

				{productInfo.numVersion > 1 && (
					<Select
						value={deleteAllVersions ? "all" : "latest"}
						onValueChange={(value) =>
							setDeleteAllVersions(value === "all")
						}
					>
						<SelectTrigger className="w-6/12">
							<SelectValue placeholder="Select a version" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="latest">
								Delete latest version
							</SelectItem>
							<SelectItem value="all">
								Delete all versions
							</SelectItem>
						</SelectContent>
					</Select>
				)}

				<div className="flex text-t2 text-sm">
					<p>
						{/* {hasCusProducts &&
              "This product has customers on it (including expired)."} */}
						{getDeleteMessage()}
					</p>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={handleArchive}
						isLoading={archiveLoading}
					>
						Archive
					</Button>
					{!hasCusProducts && (
						<Button
							variant="destructive"
							onClick={handleDelete}
							isLoading={deleteLoading}
						>
							Confirm
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
