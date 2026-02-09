import {
	type BillingInterval,
	isPriceItem,
	notNullish,
	nullish,
	type ProductItem,
	ProductItemInterval,
	productV2ToBasePrice,
} from "@autumn/shared";
import { ArrowsClockwiseIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import { FormLabel } from "@/components/v2/form/FormLabel";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/v2/inputs/InputGroup";
import { AreaRadioGroupItem } from "@/components/v2/radio-groups/AreaRadioGroupItem";
import { RadioGroup } from "@/components/v2/radio-groups/RadioGroup";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useOrg } from "@/hooks/common/useOrg";
import { SelectBillingCycle } from "./SelectBillingCycle";

export const BasePriceSection = ({
	withSeparator = true,
}: {
	withSeparator?: boolean;
}) => {
	const { product, setProduct } = useProduct();
	const { sheetType } = useSheet();

	const basePriceType = product.basePriceType;
	const { org } = useOrg();
	const defaultCurrency = org?.default_currency?.toUpperCase() ?? "USD";

	// When sheetType is null, we're in CreateProductSheet (overlay sheet, not inline sheet)
	const isCreatingNewPlan = sheetType === null;

	if (!product.items) return null;
	if (product.planType !== "paid") return null;

	const basePrice = productV2ToBasePrice({ product });

	const getBasePriceIndex = () => {
		return product.items.findIndex(
			(item: ProductItem) =>
				item.price === basePrice?.price && isPriceItem(item),
		);
	};

	const setItem = (item: ProductItem) => {
		const newItems = [...product.items];
		newItems[getBasePriceIndex()] = item;
		setProduct({
			...product,
			items: newItems,
		});
	};

	const handleUpdateBasePrice = ({
		amount,
		interval,
		intervalCount,
	}: {
		amount?: string;
		interval?: BillingInterval;
		intervalCount?: number;
	}) => {
		const newItems = [...product.items];

		// Find base price item by isBasePrice flag, not by price match
		const basePriceIndex = newItems.findIndex((item: ProductItem) =>
			isPriceItem(item),
		);

		if (basePriceIndex !== -1) {
			const newAmount =
				amount === ""
					? amount
					: notNullish(amount)
						? Number.parseFloat(amount ?? "")
						: basePrice?.price;

			newItems[basePriceIndex] = {
				...newItems[basePriceIndex],
				price: newAmount as number,
				// interval: interval
				// 	? billingToItemInterval({ billingInterval: interval })
				// 	: basePrice?.interval,
				interval_count: interval ? intervalCount : basePrice?.interval_count,
			};
		}

		setProduct({
			...product,
			items: newItems,
		});
	};

	const disabled = nullish(basePrice);

	// Determine if we're in "usage" (per unit only) mode or "base price" mode
	const isPerUnitOnly = basePriceType === "usage";

	// Get the billing type (recurring or one-off) - default to recurring
	const billingType =
		basePriceType === "usage"
			? "recurring"
			: basePriceType === "one-off"
				? "one-off"
				: "recurring";

	const handleBillingTypeChange = (value: string) => {
		// Only change billing type if we're in base price mode
		if (isPerUnitOnly) return;

		// Check if there's already a price item
		const hasPriceItem = product.items.some((item) => isPriceItem(item));

		if (!hasPriceItem) {
			// Recreate the price item with default price of 0
			const newPriceItem: ProductItem = {
				price: "" as unknown as number,
				interval: value === "one-off" ? null : ProductItemInterval.Month,
				interval_count: 1,
			};

			setProduct({
				...product,
				basePriceType: value as "recurring" | "one-off",
				items: [...product.items, newPriceItem],
			});
			return;
		}

		// Update existing price item
		setProduct({
			...product,
			basePriceType: value as "recurring" | "one-off",
			items: product.items.map((item) => {
				if (isPriceItem(item)) {
					return {
						...item,
						interval: value === "one-off" ? null : ProductItemInterval.Month,
					};
				}
				return item;
			}),
		});
	};

	const handlePriceTypeChange = (value: string) => {
		if (value === "usage") {
			// Switch to per unit only - remove base price item
			setProduct({
				...product,
				basePriceType: "usage",
				items: product.items.filter((item) => !isPriceItem(item)),
			});
		} else {
			// Switch to base price - restore price item with current billing type
			const hasPriceItem = product.items.some((item) => isPriceItem(item));

			if (!hasPriceItem) {
				const newPriceItem: ProductItem = {
					price: "" as unknown as number,
					interval:
						billingType === "one-off" ? null : ProductItemInterval.Month,
					interval_count: 1,
				};

				setProduct({
					...product,
					basePriceType: billingType as "recurring" | "one-off",
					items: [...product.items, newPriceItem],
				});
			} else {
				setProduct({
					...product,
					basePriceType: billingType as "recurring" | "one-off",
				});
			}
		}
	};

	return (
		<SheetSection title="Plan Price" withSeparator={withSeparator}>
			<div className="space-y-4">
				<div className="py-2">
					<RadioGroup
						value={isPerUnitOnly ? "usage" : "base"}
						onValueChange={handlePriceTypeChange}
						className="space-y-1"
					>
						<AreaRadioGroupItem
							value="base"
							label="Base price"
							description={`This plan has a fixed price. ${isCreatingNewPlan ? "You can add per-unit prices later." : ""}`}
						/>
						<AreaRadioGroupItem
							value="usage"
							label="Per unit only"
							description="Plan price is based entirely on usage or units purchased."
						/>
					</RadioGroup>
				</div>


				<div className="space-y-2">
					<GroupedTabButton
						value={billingType}
						className="w-full"
						onValueChange={handleBillingTypeChange}
						disabled={isPerUnitOnly}
						options={[
							{
								value: "recurring",
								label: "Recurring",
								icon: (
									<ArrowsClockwiseIcon
										className="size-[14px]"
										weight="regular"
									/>
								),
							},
							{
								value: "one-off",
								label: "One-off",
								icon: (
									<CheckCircleIcon
										className="size-[14px]"
										weight="regular"
									/>
								),
							},
						]}
					/>
				</div>
				<div className="flex gap-2">
					<div className="w-full">
						<FormLabel disabled={disabled || isPerUnitOnly}>Price</FormLabel>
					<InputGroup data-disabled={isPerUnitOnly}>
						<InputGroupInput
							type="number"
							placeholder="eg. 100"
							disabled={isPerUnitOnly}
							value={isPerUnitOnly ? "" : (basePrice?.price ?? "")}
							onKeyDown={(e) => {
								// Prevent typing minus sign
								if (e.key === "-" || e.key === "Minus") {
									e.preventDefault();
								}
							}}
							onChange={(e) => {
								// extra guard in case value changes programmatically
								const cleanedValue = e.target.value.replace(/-/g, "");
								if (Number(cleanedValue) >= 0) {
									handleUpdateBasePrice({
										amount: cleanedValue,
									});
								}
							}}
						/>
						<InputGroupAddon align="inline-end">
							<span className="text-t3 text-xs">{defaultCurrency}</span>
						</InputGroupAddon>
					</InputGroup>
					</div>
					{billingType === "recurring" && (
						<div className="w-full">
							<SelectBillingCycle
								item={basePrice}
								setItem={setItem}
								disabled={disabled || isPerUnitOnly}
								filterOneOff={billingType === "recurring"}
							/>
						</div>
					)}
				</div>

			</div>
		</SheetSection>
	);
};
