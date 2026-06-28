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
	Button,
	FormLabel,
	GroupedTabButton,
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@autumn/ui";
import {
	ArrowsClockwiseIcon,
	CheckCircleIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useOrg } from "@/hooks/common/useOrg";
import { FreeTrialOption } from "./FreeTrialOption";
import { SelectBillingCycle } from "./SelectBillingCycle";

export const BasePriceSection = ({
	withSeparator = false,
	className,
}: {
	withSeparator?: boolean;
	className?: string;
}) => {
	const { product, setProduct } = useProduct();
	const { org } = useOrg();
	const defaultCurrency = org?.default_currency?.toUpperCase() ?? "USD";

	if (!product.items) return null;
	if (!product.planType) return null;

	const basePrice = productV2ToBasePrice({ product });
	const hasBasePrice =
		product.basePriceType === "recurring" ||
		product.basePriceType === "one-off";
	const billingType =
		product.basePriceType === "one-off" ? "one-off" : "recurring";

	const getBasePriceIndex = () =>
		product.items.findIndex(
			(item: ProductItem) =>
				item.price === basePrice?.price && isPriceItem(item),
		);

	const setItem = (item: ProductItem) => {
		const newItems = [...product.items];
		newItems[getBasePriceIndex()] = item;
		setProduct({ ...product, items: newItems });
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
				interval_count: interval ? intervalCount : basePrice?.interval_count,
			};
		}

		setProduct({ ...product, items: newItems });
	};

	const addBasePrice = () => {
		const hasPriceItem = product.items.some((item) => isPriceItem(item));
		setProduct({
			...product,
			basePriceType: "recurring",
			items: hasPriceItem
				? product.items
				: [
						...product.items,
						{
							price: "" as unknown as number,
							interval: ProductItemInterval.Month,
							interval_count: 1,
						},
					],
		});
	};

	const removeBasePrice = () => {
		setProduct({
			...product,
			basePriceType: "usage",
			items: product.items.filter((item) => !isPriceItem(item)),
		});
	};

	const handleBillingTypeChange = (value: string) => {
		setProduct({
			...product,
			basePriceType: value as "recurring" | "one-off",
			items: product.items.map((item) =>
				isPriceItem(item)
					? {
							...item,
							interval: value === "one-off" ? null : ProductItemInterval.Month,
						}
					: item,
			),
		});
	};

	const disabled = nullish(basePrice);

	const isPaid = product.planType === "paid";

	return (
		<SheetSection
			title={isPaid ? "Base price" : undefined}
			description={
				isPaid
					? "Add a fixed price for the plan. Optional for per-unit or usage-based plans."
					: undefined
			}
			className={className}
			withSeparator={withSeparator}
			action={
				isPaid && hasBasePrice ? (
					<Button
						variant="ghost"
						size="mini"
						className="gap-1 text-tertiary-foreground hover:text-destructive"
						onClick={removeBasePrice}
					>
						<TrashIcon className="size-3.5" />
						Remove
					</Button>
				) : undefined
			}
		>
			<div className="space-y-5">
				{isPaid &&
					(hasBasePrice ? (
						<div className="space-y-2">
							<GroupedTabButton
								value={billingType}
								className="w-full"
								onValueChange={handleBillingTypeChange}
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

							<div className="flex gap-2">
								<div className="w-full">
									<FormLabel disabled={disabled}>Price</FormLabel>
									<InputGroup>
										<InputGroupInput
											type="number"
											placeholder="eg. 100"
											value={basePrice?.price ?? ""}
											onKeyDown={(e) => {
												if (e.key === "-" || e.key === "Minus") {
													e.preventDefault();
												}
											}}
											onChange={(e) => {
												const cleanedValue = e.target.value.replace(/-/g, "");
												if (Number(cleanedValue) >= 0) {
													handleUpdateBasePrice({ amount: cleanedValue });
												}
											}}
										/>
										<InputGroupAddon align="inline-end">
											<span className="text-tertiary-foreground text-xs">
												{defaultCurrency}
											</span>
										</InputGroupAddon>
									</InputGroup>
								</div>
								{billingType === "recurring" && (
									<div className="w-full">
										<SelectBillingCycle
											item={basePrice}
											setItem={setItem}
											disabled={disabled}
											filterOneOff={true}
										/>
									</div>
								)}
							</div>
						</div>
					) : (
						<Button
							variant="secondary"
							size="sm"
							className="w-full gap-2"
							onClick={addBasePrice}
						>
							<PlusIcon className="size-3.5" />
							Add a base price
						</Button>
					))}
				<FreeTrialOption />
			</div>
		</SheetSection>
	);
};
