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
import { useEffect } from "react";
import { versions } from "process";
import { version } from "os";

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

	const {
		data: deletionText,
		isLoading: isDeletionTextLoading,
		mutate: mutateDeletionText,
	} = useAxiosSWR({
		url: `/products/data/deletion_text/${product.internal_id}`,
		options: {
			refreshInterval: 0,
		},
		// queryKey: [product.internal_id],
	});

	console.log("deletionText", deletionText);
	console.log("isDeletionTextLoading", isDeletionTextLoading);

	useEffect(() => {
		if (open) {
			mutateDeletionText();
		}
	}, [open, product.internal_id]);

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
		const newArchivedState = !product.archived;
		try {
			if (!deleteAllVersions) {
				if(newArchivedState == true) await ProductService.updateProduct(axiosInstance, product.id, {
					archived: newArchivedState,
				});
				else {
					const updatePromises = [];
					for (let i = 1; i <= productInfo.numVersion; i++) {
						updatePromises.push(
							ProductService.updateProduct(axiosInstance, product.id, {
								archived: newArchivedState,
								version: i,
							},
							i
						)
					);
				}
				await Promise.all(updatePromises);
				}
			} else {
				const updatePromises = [];
				for (let i = 1; i <= productInfo.numVersion; i++) {
					updatePromises.push(
						ProductService.updateProduct(
							axiosInstance,
							product.id,
							{
								archived: newArchivedState,
								version: i,
							},
							i
						)
					);
				}
				await Promise.all(updatePromises);
			}
			await mutate();
			toast.success(
				`Product ${product.name} ${newArchivedState ? "archived" : "unarchived"} successfully`
			);
			setOpen(false);
		} catch (error) {
			console.error(
				`Error ${newArchivedState ? "archiving" : "unarchiving"} product:`,
				error
			);
			toast.error(
				getBackendErr(
					error,
					`Error ${newArchivedState ? "archiving" : "unarchiving"} product`
				)
			);
		} finally {
			setArchiveLoading(false);
		}
	};

	const hasCusProductsAll = productInfo?.hasCusProducts;
	const hasCusProductsLatest = productInfo?.hasCusProductsLatest;

	const custsPreventingDeletion = deleteAllVersions
		? hasCusProductsAll
		: hasCusProductsLatest;

	const getDeleteMessage = () => {
		if (product.archived) {
			return `This product is currently archived and hidden from the UI. Would you like to unarchive it to make it visible again?\n
			Note: If there are multiple versions, this will unarchive all versions at once. If you only want to unarchive a specific version, please select the product and unarchive the specific version you want.`;
		}

		const isMultipleVersions = productInfo?.numVersion > 1;
		const versionText = deleteAllVersions ? "product" : "version";
		const productText = isMultipleVersions ? versionText : "product";

		const messageTemplates = {
			live: {
				withCustomers: {
					single: (customerName: string, productText: string) => 
						`${customerName} is on this ${productText}. Please delete them first before deleting the ${productText}. Would you like to archive the product instead?`,
					multiple: (customerName: string, otherCount: number, productText: string) => 
						`${customerName} and ${otherCount} other customer${otherCount > 1 ? "s" : ""} are on this ${productText}. Please delete them first before deleting the ${productText}. Would you like to archive the product instead?`,
					fallback: (productText: string) => 
						`There are customers on this ${productText}. Please delete them first before deleting the ${productText}. Would you like to archive the product instead?`
				},
				withoutCustomers: (productText: string) => 
					`Are you sure you want to delete this ${productText}? This action cannot be undone. You can also archive the ${productText} instead.`
			},
			sandbox: {
				withCustomers: {
					single: (customerName: string, productText: string) => 
						`${customerName} is on this ${productText}. Deleting this ${productText} will remove it from ${customerName}'s account. Are you sure you want to continue? You can also archive the product instead.`,
					multiple: (customerName: string, otherCount: number, productText: string) => 
						`${customerName} and ${otherCount} other customer${otherCount > 1 ? "s" : ""} are on this ${productText}. Deleting this ${productText} will remove it from their accounts. Are you sure you want to continue? You can also archive the product instead.`,
					fallback: (productText: string) => 
						`There are customers on this ${productText}. Deleting this ${productText} will remove it from their accounts. Are you sure you want to continue? You can also archive the product instead.`
				},
				withoutCustomers: (productText: string) => 
					`Are you sure you want to delete this ${productText}? This action cannot be undone.`
			}
		};

		const envKey = env === AppEnv.Live ? 'live' : 'sandbox';
		const templates = messageTemplates[envKey];

		if (custsPreventingDeletion) {
			if (deletionText?.customerName && deletionText?.totalCount) {
				const totalCount = parseInt(deletionText.totalCount);
				
				if (isNaN(totalCount) || totalCount <= 0) {
					return templates.withCustomers.fallback(productText);
				} else if (totalCount === 1) {
					return templates.withCustomers.single(deletionText.customerName, productText);
				} else {
					const otherCount = totalCount - 1;
					return templates.withCustomers.multiple(deletionText.customerName, otherCount, productText);
				}
			} else {
				return templates.withCustomers.fallback(productText);
			}
		} else {
			return templates.withoutCustomers(productText);
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
					<DialogTitle>
						{product.archived ? "Unarchive" : "Delete"}{" "}
						{product.name}
					</DialogTitle>
				</DialogHeader>

				{productInfo.numVersion > 1 && !product.archived && (
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
						{getDeleteMessage().split('\n').map((line, index) => (
							<span key={index}>
								{line}
								{index < getDeleteMessage().split('\n').length - 1 && <br />}
							</span>
						))}
					</p>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={handleArchive}
						isLoading={archiveLoading}
					>
						{product.archived ? "Unarchive" : "Archive"}
					</Button>

					{!product.archived &&
						(!custsPreventingDeletion ||
							env === AppEnv.Sandbox) && (
							<Button
								variant="destructive"
								onClick={handleDelete}
								isLoading={deleteLoading}
							>
								Delete
							</Button>
						)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
