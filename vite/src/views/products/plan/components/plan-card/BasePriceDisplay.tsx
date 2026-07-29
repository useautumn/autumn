import type { FrontendProduct } from "@autumn/shared";
import { Button } from "@autumn/ui";
import {
	type AdminPlanIds,
	AdminPlanIdsTooltip,
} from "@/components/forms/shared/admin/AdminPlanIdsTooltip";
import {
	useCurrentItem,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import { getBasePriceDisplay } from "@/utils/product/basePriceDisplayUtils";
import { checkItemIsValid } from "@/utils/product/entitlementUtils";
import { AdditionalCurrenciesHint } from "./AdditionalCurrenciesHint";

export const BasePriceDisplay = ({
	isOnboarding,
	product,
	readOnly = false,
	slim = false,
	adminIds,
	currency,
}: {
	isOnboarding?: boolean;
	product: FrontendProduct;
	readOnly?: boolean;
	/** Compact sizing for the slim license card header. */
	slim?: boolean;
	adminIds?: AdminPlanIds;
	/** Display currency for amounts; defaults to the org default. */
	currency?: string;
}) => {
	const { sheetType, setSheet } = useSheet();
	const { org } = useOrg();

	const item = useCurrentItem();

	const isEditingPlanPrice = sheetType === "edit-plan-price";

	const handleClick = () => {
		setSheet({ type: "edit-plan-price", itemId: product.id });
	};

	const renderPriceContent = () => {
		const priceDisplay = getBasePriceDisplay({
			product,
			currency: currency ?? org?.default_currency,
			showPlaceholder: true,
		});

		switch (priceDisplay.type) {
			case "free":
				return (
					<span
						className={cn("text-main-sec inline-block", slim && "text-xs!")}
					>
						{priceDisplay.displayText}
					</span>
				);

			case "price": {
				const additionalCurrencies = org?.config?.multi_currency
					? (priceDisplay.additionalCurrencies ?? [])
					: [];

				return (
					<span
						className={cn(
							"text-body-secondary flex items-center gap-1",
							slim && "text-xs!",
						)}
					>
						<span
							className={cn(
								"text-main-sec text-muted-foreground! font-semibold!",
								slim && "text-xs! font-medium! tabular-nums",
							)}
						>
							{priceDisplay.formattedAmount}
						</span>{" "}
						<span className={cn("mt-0.5", slim && "mt-0")}>
							{priceDisplay.intervalText}
						</span>
						{additionalCurrencies.length > 0 && (
							<AdditionalCurrenciesHint currencies={additionalCurrencies} />
						)}
					</span>
				);
			}

			case "variable":
				return (
					<span className={cn("text-tertiary-foreground!", slim && "text-xs!")}>
						{readOnly ? priceDisplay.displayText : "Price varies"}
					</span>
				);

			case "placeholder":
				return (
					<span
						className={cn(
							"text-subtle text-body-secondary inline-block",
							slim && "text-xs!",
						)}
					>
						{priceDisplay.displayText}
					</span>
				);
		}
	};

	// readOnly: render a plain span so hover events reach the admin tooltip
	// (the editable Button uses `pointer-events-none` on readOnly which would
	// suppress hover detection).
	if (readOnly) {
		const content = (
			<span
				className={cn(
					"inline-flex items-center gap-1 cursor-default",
					isOnboarding && "mt-1",
				)}
			>
				{renderPriceContent()}
			</span>
		);
		if (!adminIds) return content;
		return <AdminPlanIdsTooltip ids={adminIds}>{content}</AdminPlanIdsTooltip>;
	}

	const button = (
		<Button
			variant="secondary"
			size="default"
			className={cn(
				"items-center h-9! gap-1 rounded-xl px-2.5! hover:z-95",
				slim && "h-6! rounded-md px-1.5! text-xs",
				isEditingPlanPrice && !isOnboarding && "btn-secondary-active z-95",
				isOnboarding &&
					"bg-transparent! border-none! outline-0! border-transparent! pointer-events-none shadow-none! p-0! h-fit! mt-1",
			)}
			onClick={() => {
				if (item && !checkItemIsValid(item)) return;
				handleClick();
			}}
		>
			{renderPriceContent()}
		</Button>
	);

	if (!adminIds) return button;
	return <AdminPlanIdsTooltip ids={adminIds}>{button}</AdminPlanIdsTooltip>;
};
