import {
	type BillingInterval,
	isPriceItem,
	notNullish,
	nullish,
	type ProductItem,
	ProductItemInterval,
	productV2ToBasePrice,
} from "@autumn/shared";
import {
	ArrowsClockwiseIcon,
	BarcodeIcon,
	CheckCircleIcon,
} from "@phosphor-icons/react";
import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import { FormLabel } from "@/components/v2/form/FormLabel";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/v2/inputs/InputGroup";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { type SheetType, useSheetStore } from "@/hooks/stores/useSheetStore";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { SelectBillingCycle } from "./SelectBillingCycle";

export const BasePriceSection = ({
	withSeparator = true,
}: {
	withSeparator?: boolean;
}) => {
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);

	const basePriceType = product.basePriceType;
	const { org } = useOrg();
	const defaultCurrency = org?.default_currency?.toUpperCase() ?? "USD";
	const sheetType = useSheetStore((s) => s.type) as SheetType;

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

	return (
		<SheetSection
			title="Base Price"
			withSeparator={withSeparator}
			description={`Flat-rate cost to access this plan.${isCreatingNewPlan ? " You can add per-unit prices later." : ""}`}
		>
			<div className="space-y-3">
				<div className="space-y-2">
					<GroupedTabButton
						value={basePriceType ?? "recurring"}
						className="w-full hello"
						onValueChange={(value) => {
							//if usage based, remove the base price item
							if (value === "usage") {
								setProduct({
									...product,
									basePriceType: value as "recurring" | "one-off" | "usage",
									items: product.items.filter((item) => !isPriceItem(item)),
								});
								return;
							}

							// Check if there's already a price item
							const hasPriceItem = product.items.some((item) =>
								isPriceItem(item),
							);

							if (!hasPriceItem) {
								// Recreate the price item with default price of 0
								const newPriceItem: ProductItem = {
									price: "" as unknown as number,
									interval:
										value === "one-off" ? null : ProductItemInterval.Month,
									interval_count: 1,
								};

								setProduct({
									...product,
									basePriceType: value as "recurring" | "one-off" | "usage",
									items: [...product.items, newPriceItem],
								});
								return;
							}

							// Update existing price item
							setProduct({
								...product,
								basePriceType: value as "recurring" | "one-off" | "usage",
								items: product.items.map((item) => {
									if (isPriceItem(item)) {
										return {
											...item,
											interval:
												value === "one-off" ? null : ProductItemInterval.Month,
										};
									}
									return item;
								}),
							});
						}}
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
									<CheckCircleIcon className="size-[14px]" weight="regular" />
								),
							},
							{
								value: "usage",
								label: "Per unit only",
								icon: <BarcodeIcon className="size-[14px]" weight="regular" />,
							},
						]}
					/>
					{/* <p className="text-t4 text-sm">{priceDescription}</p> */}
				</div>
				<div className="h-13">
					{basePriceType !== "usage" ? (
						<div className="flex gap-2">
							<div className="w-full">
								<FormLabel disabled={disabled}>Price</FormLabel>
								<InputGroup>
									<InputGroupInput
										type="number"
										placeholder="eg. 100"
										disabled={disabled}
										value={basePrice?.price ?? ""}
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
							{basePriceType === "recurring" && (
								<div className="w-full">
									<SelectBillingCycle
										item={basePrice}
										setItem={setItem}
										disabled={disabled}
										filterOneOff={basePriceType === "recurring"}
									/>
								</div>
							)}
						</div>
					) : (
						<InfoBox variant="note">
							This plan has no base price. You can add per unit prices, such as
							per "seat" or "credit", when adding features.
						</InfoBox>
					)}
				</div>
			</div>
		</SheetSection>
	);
};
