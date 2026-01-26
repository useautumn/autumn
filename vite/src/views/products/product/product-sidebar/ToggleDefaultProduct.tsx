import { isFreeProductV2 } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { ToggleButton } from "@/components/general/ToggleButton";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, notNullish } from "@/utils/genUtils";
import { useProductCountsQuery } from "../hooks/queries/useProductCountsQuery";
import { useProductContext } from "../ProductContext";

const ToggleProductDialog = ({
	open,
	setOpen,
	description,
	toggleKey,
	value,
	toggleProduct,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	description: string;
	toggleKey: "is_default" | "is_add_on";
	value: boolean;
	toggleProduct: (value: boolean, optimisticUpdate?: boolean) => Promise<void>;
}) => {
	const { product } = useProductContext();
	const [loading, setLoading] = useState(false);
	const handleConfirm = async () => {
		setLoading(true);
		try {
			await toggleProduct(value, false);
			setOpen(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update plan"));
		}
		setLoading(false);
	};

	const getTitle = () => {
		if (toggleKey === "is_default") {
			return value
				? `Make ${product.name} a default plan`
				: `Remove default from ${product.name}`;
		} else {
			return value
				? `Make ${product.name} an add-on`
				: `Remove ${product.name} as an add-on`;
		}
	};
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{getTitle()}</DialogTitle>
				</DialogHeader>
				<DialogDescription>
					<p>{description}</p>
				</DialogDescription>
				<DialogFooter>
					<Button
						variant="secondary"
						isLoading={loading}
						onClick={handleConfirm}
					>
						Confirm
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

export const ToggleDefaultProduct = ({
	toggleKey,
}: {
	toggleKey: "is_default" | "is_add_on";
}) => {
	const axiosInstance = useAxiosInstance();
	const { product, setProduct, isCusProductView, groupDefaults } =
		useProductContext();

	const { counts } = useProductCountsQuery();

	const activeCount = counts?.active;
	const [open, setOpen] = useState(false);
	const [dialogDescription, setDialogDescription] = useState("");
	const [toggling, setToggling] = useState(false);

	const toggleProduct = async (value: boolean, optimisticUpdate = true) => {
		setToggling(true);

		if (toggling) {
			return;
		}

		try {
			if (optimisticUpdate) {
				setProduct({
					...product,
					[toggleKey]: value,
				});
			}

			const data = {
				[toggleKey]: value,
				free_trial: toggleKey === "is_default" ? product.free_trial : undefined,
			};

			await ProductService.updateProduct(axiosInstance, product.id, data);
			// mutate();
			setOpen(false);
			toast.success("Successfully updated plan");
		} catch (error) {
			setProduct({
				...product,
				[toggleKey]: !value,
			});

			toast.error(getBackendErr(error, "Failed to update plan"));
		} finally {
			setToggling(false);
		}
	};

	const handleToggle = async (value: boolean) => {
		if (toggling) return;

		const disableDefaultDescription = getDisableDefaultDescription(value);
		if (disableDefaultDescription) {
			setDialogDescription(disableDefaultDescription);
			setOpen(true);
			return;
		}

		if (activeCount > 0) {
			const activeCusStr = activeCount === 1 ? "customer" : "customers";
			// 1. If key is default
			if (toggleKey === "is_default") {
				if (value) {
					setDialogDescription(
						`You have ${activeCount} active ${activeCusStr} on this plan. Are you sure you want to make this plan default?`,
					);
				} else {
					setDialogDescription(
						`You have ${activeCount} active ${activeCusStr} on this plan. Are you sure you want to remove this plan as default?`,
					);
				}
			} else {
				if (value) {
					setDialogDescription(
						`You have ${activeCount} active ${activeCusStr} on this plan. Are you sure you want to make this plan an add-on?`,
					);
				} else {
					setDialogDescription(
						`You have ${activeCount} active ${activeCusStr} on this plan. Are you sure you want to remove this plan as an add-on?`,
					);
				}
			}
			setOpen(true);
		} else {
			await toggleProduct(value);
		}
	};

	const getDisableDefaultDescription = (value: boolean) => {
		// 1. Is default trial
		if (toggleKey !== "is_default") return;

		const isDefaultTrial =
			value && product.free_trial && !isFreeProductV2(product);

		if (isDefaultTrial && notNullish(groupDefaults?.defaultTrial)) {
			return `${groupDefaults.defaultTrial.name} is currently a default trial plan. Making ${product.name} a default trial will remove ${groupDefaults.defaultTrial.name} as a default trial plan.`;
		}

		if (value && notNullish(groupDefaults?.free)) {
			return `${groupDefaults.free.name} is currently a default plan. Making ${product.name} a default plan will remove ${groupDefaults.free.name} as a default plan.`;
		}
	};

	const isDisabled =
		(toggleKey === "is_add_on" && product.is_default) ||
		(toggleKey === "is_default" && product.is_add_on);

	return (
		<>
			<ToggleProductDialog
				open={open}
				setOpen={setOpen}
				description={dialogDescription}
				toggleKey={toggleKey}
				value={!product[toggleKey]}
				toggleProduct={toggleProduct}
			/>
			<ToggleButton
				value={product[toggleKey]}
				setValue={handleToggle}
				className="text-t2 px-2"
				disabled={isDisabled || isCusProductView}
			/>
		</>
	);
};
