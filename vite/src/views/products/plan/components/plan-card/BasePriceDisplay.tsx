import type { FrontendProduct } from "@autumn/shared";

import {
	AdminPlanIdsTooltip,
	type AdminPlanIds,
} from "@/components/forms/shared/admin/AdminPlanIdsTooltip";
import { Button } from "@/components/v2/buttons/Button";
import {
	useCurrentItem,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import { getBasePriceDisplay } from "@/utils/product/basePriceDisplayUtils";
import { checkItemIsValid } from "@/utils/product/entitlementUtils";

export const BasePriceDisplay = ({
	isOnboarding,
	product,
	readOnly = false,
	adminIds,
}: {
	isOnboarding?: boolean;
	product: FrontendProduct;
	readOnly?: boolean;
	adminIds?: AdminPlanIds;
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
			currency: org?.default_currency,
			showPlaceholder: true,
		});

		switch (priceDisplay.type) {
			case "free":
				return (
					<span className="text-main-sec inline-block">
						{priceDisplay.displayText}
					</span>
				);

			case "price":
				return (
					<span className="text-body-secondary flex items-center gap-1">
						<span className="text-main-sec text-t2! font-semibold!">
							{priceDisplay.formattedAmount}
						</span>{" "}
						<span className="mt-0.5">{priceDisplay.intervalText}</span>
					</span>
				);

			case "variable":
				return <span className="text-t3!">{priceDisplay.displayText}</span>;

			case "placeholder":
				return (
					<span className="text-t4 text-body-secondary inline-block">
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
		return (
			<AdminPlanIdsTooltip ids={adminIds}>{content}</AdminPlanIdsTooltip>
		);
	}

	const button = (
		<Button
			variant="secondary"
			size="default"
			className={cn(
				"items-center h-9! gap-1 rounded-xl px-2.5! hover:z-95",
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
