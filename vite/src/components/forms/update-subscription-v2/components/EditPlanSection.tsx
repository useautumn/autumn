import { formatAmount, formatInterval, isPriceItem } from "@autumn/shared";
import { useMemo } from "react";
import { PlanItemsSection } from "@/components/forms/shared";
import { PlanEditButton } from "@/components/forms/shared/plan-items/PlanEditButton";
import { PlanLicenseItemsSections } from "@/components/forms/shared/plan-items/PlanLicenseItemsSections";
import { usePlanLicenseRows } from "@/components/forms/shared/plan-items/PlanLicensesSummary";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { customerLicenseTotals } from "@/utils/billing/licenseQuantityUtils";
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
	const { prepaidOptions, licenseQuantities } = formValues;
	const isCustomized =
		formValues.items !== null || formValues.addLicenses !== null;
	const hasCustomizations = isCustomized || isVersionReady;

	const {
		displayCurrency: currency,
		itemsForDisplay,
		productForDisplay,
	} = useCustomerDisplayCurrency();

	const existingLicenseQuantities = useMemo(
		() =>
			customerLicenseTotals({
				customerLicenses: customerProduct?.customer_licenses,
			}),
		[customerProduct?.customer_licenses],
	);
	const licenseQuantityEditor = {
		form,
		quantities: licenseQuantities,
		existingQuantities: existingLicenseQuantities,
	};

	const { rows: licenseRows } = usePlanLicenseRows({
		planId: product?.id,
		addLicenses: formValues.addLicenses,
		features,
	});
	const hasLicenseRows = licenseRows.length > 0;

	const displayProduct = useMemo(
		() => product && productForDisplay(product),
		[product, productForDisplay],
	);

	const displayOriginalItems = useMemo(
		() => originalItems && itemsForDisplay(originalItems),
		[originalItems, itemsForDisplay],
	);

	const priceChange = useMemo(() => {
		const originalPriceItem = displayOriginalItems?.find((i) => isPriceItem(i));
		const currentPriceItem = displayProduct?.items?.find((i) => isPriceItem(i));

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
	}, [displayOriginalItems, displayProduct?.items, currency]);

	return (
		<>
			<SheetSection
				title={<SectionTitle hasCustomizations={isCustomized} />}
				withSeparator
			>
				<PlanItemsSection
					product={displayProduct}
					originalItems={displayOriginalItems}
					features={features}
					prepaidOptions={prepaidOptions}
					initialPrepaidOptions={initialPrepaidOptions}
					existingOptions={customerProduct?.options}
					form={form}
					showDiff={hasCustomizations}
					addLicenses={formValues.addLicenses}
					licenseQuantityEditor={licenseQuantityEditor}
					currency={currency}
					onEditPlan={handleEditPlan}
					priceChange={priceChange}
					showEditButton={!hasLicenseRows}
					adminIds={{
						stripe_product_id: product?.stripe_id ?? null,
						internal_product_id: product?.internal_id ?? null,
					}}
				/>
			</SheetSection>
			<PlanLicenseItemsSections
				planId={product?.id}
				addLicenses={formValues.addLicenses}
				features={features}
				currency={currency}
				showDiff={hasCustomizations}
			/>
			{hasLicenseRows && (
				<SheetSection withSeparator>
					<PlanEditButton onEditPlan={handleEditPlan} />
				</SheetSection>
			)}
		</>
	);
}
