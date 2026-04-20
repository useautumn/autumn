import { formatAmount, formatInterval, isPriceItem } from "@autumn/shared";
import { useMemo } from "react";
import { PlanItemsSection } from "@/components/forms/shared";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useOrg } from "@/hooks/common/useOrg";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";
import { SectionTitle } from "./SectionTitle";

export function EditPlanSection() {
	const {
		formContext,
		form,
		formValues,
		features,
		originalItems,
		initialPrepaidOptions,
		productWithFormItems: product,
		isVersionReady,
		handleEditPlan,
	} = useUpdateSubscriptionFormContext();

	const { customerProduct } = formContext;
	const { prepaidOptions } = formValues;
	const hasCustomizations = formValues.items !== null || isVersionReady;

	const { org } = useOrg();
	const currency = org?.default_currency ?? "USD";

	const priceChange = useMemo(() => {
		const originalPriceItem = originalItems?.find((i) => isPriceItem(i));
		const currentPriceItem = product?.items?.find((i) => isPriceItem(i));

		const originalPrice = originalPriceItem?.price ?? 0;
		const currentPrice = currentPriceItem?.price ?? 0;

		const originalInterval = originalPriceItem?.interval;
		const currentInterval = currentPriceItem?.interval;
		const originalIntervalCount = originalPriceItem?.interval_count ?? 1;
		const currentIntervalCount = currentPriceItem?.interval_count ?? 1;

		const priceChanged = originalPrice !== currentPrice;
		const intervalChanged =
			originalInterval !== currentInterval ||
			originalIntervalCount !== currentIntervalCount;

		if (!priceChanged && !intervalChanged) return null;

		const formatPrice = (amount: number) =>
			formatAmount({
				currency,
				amount,
				amountFormatOptions: {
					style: "currency",
					currencyDisplay: "narrowSymbol",
				},
			});

		const getIntervalText = (
			interval: typeof originalInterval,
			intervalCount: number,
			hasPriceItem: boolean,
		) => {
			if (interval) {
				return formatInterval({ interval, intervalCount });
			}
			return hasPriceItem ? "one-time" : null;
		};

		const oldIntervalText = getIntervalText(
			originalInterval,
			originalIntervalCount,
			!!originalPriceItem,
		);

		const newIntervalText = getIntervalText(
			currentInterval,
			currentIntervalCount,
			!!currentPriceItem,
		);

		return {
			oldPrice: formatPrice(originalPrice),
			newPrice: formatPrice(currentPrice),
			oldIntervalText: intervalChanged ? oldIntervalText : null,
			newIntervalText,
			isUpgrade: currentPrice > originalPrice,
		};
	}, [originalItems, product?.items, currency]);

	return (
		<SheetSection
			title={<SectionTitle hasCustomizations={formValues.items !== null} />}
			withSeparator
		>
			<PlanItemsSection
				product={product}
				originalItems={originalItems}
				features={features}
				prepaidOptions={prepaidOptions}
				initialPrepaidOptions={initialPrepaidOptions}
				existingOptions={customerProduct?.options}
				form={form}
				showDiff={hasCustomizations}
				currency={currency}
				onEditPlan={handleEditPlan}
				priceChange={priceChange}
			/>
		</SheetSection>
	);
}
