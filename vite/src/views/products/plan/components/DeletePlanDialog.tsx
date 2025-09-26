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
import { useProductContext } from "../../product/ProductContext";

export const DeletePlanDialog = ({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const { product } = useProductContext();
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [archiveLoading, setArchiveLoading] = useState(false);
	const [deleteAllVersions, setDeleteAllVersions] = useState(false);
	const axiosInstance = useAxiosInstance();
	const { refetch: refetchProducts } = useProductsQuery();

	const { data: productInfo, isLoading } = useGeneralQuery({
		url: `/products/${product.id}/info`,
		queryKey: ["productInfo", product.id],
		enabled: open,
	});

	const handleDelete = async () => {
		setDeleteLoading(true);
		try {
			await ProductService.deleteProduct(
				axiosInstance,
				product.id,
				deleteAllVersions,
			);

			await refetchProducts();
			setOpen(false);
			toast.success("Plan deleted successfully");
		} catch (error: unknown) {
			console.error("Error deleting plan:", error);
			toast.error(getBackendErr(error as AxiosError, "Error deleting plan"));
		} finally {
			setDeleteLoading(false);
		}
	};

	const handleArchive = async () => {
		setArchiveLoading(true);
		const newArchivedState = !product.archived;
		try {
			if (!deleteAllVersions) {
				if (newArchivedState === true) {
					await ProductService.updateProduct(axiosInstance, product.id, {
						archived: newArchivedState,
					});
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
								i,
							),
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
							i,
						),
					);
				}
				await Promise.all(updatePromises);
			}
			await refetchProducts();
			toast.success(
				`Plan ${product.name} ${newArchivedState ? "archived" : "unarchived"} successfully`,
			);
			setOpen(false);
		} catch (error: unknown) {
			toast.error(
				getBackendErr(
					error as AxiosError,
					`Error ${newArchivedState ? "archiving" : "unarchiving"} plan`,
				),
			);
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
		if (product.archived) {
			return `This plan is currently archived and hidden from the UI. Would you like to unarchive it to make it visible again?\n\nNote: If there are multiple versions, this will unarchive all versions at once.`;
		}

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

	if (!productInfo || isLoading) {
		return <></>;
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="w-md" onClick={(e) => e.stopPropagation()}>
				<DialogHeader>
					<DialogTitle>
						{product.archived ? "Unarchive" : "Delete"} {product.name}
					</DialogTitle>
					<DialogDescription>
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

				{productInfo.numVersion > 1 && !product.archived && (
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
							variant="secondary"
							onClick={handleArchive}
							disabled={archiveLoading}
						>
							Unarchive
						</Button>
					)}
					{hasCusProducts && !product.archived && (
						<Button
							variant="secondary"
							onClick={handleArchive}
							disabled={archiveLoading}
						>
							Archive
						</Button>
					)}

					{!hasCusProducts && !product.archived && (
						<Button
							variant="destructive"
							onClick={handleDelete}
							disabled={deleteLoading}
						>
							Delete
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
