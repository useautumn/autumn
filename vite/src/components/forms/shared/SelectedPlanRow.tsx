import type { ProductItem, ProductV2 } from "@autumn/shared";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import {
	PackageIcon,
	PencilSimpleIcon,
	PuzzlePieceIcon,
	XIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { PriceDisplay } from "@/components/forms/update-subscription-v2/components/PriceDisplay";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { cn } from "@/lib/utils";
import { getSelectedPlanPriceProduct } from "./selectedPlanRowUtils";

const TOOLTIP_DELAY_MS = 250;

/** A custom plan's icon turns green in place of a "Custom" tag. */
function PlanIcon({
	isAddOn,
	isCustom,
}: {
	isAddOn: boolean;
	isCustom?: boolean;
}) {
	const Icon = isAddOn ? PuzzlePieceIcon : PackageIcon;
	const className = cn(
		"size-3.5 shrink-0",
		isCustom ? "text-green-500" : "text-tertiary-foreground",
	);
	if (!isCustom) return <Icon className={className} />;

	return (
		<Tooltip delayDuration={TOOLTIP_DELAY_MS}>
			<TooltipTrigger asChild>
				<Icon className={className} aria-label="Custom" />
			</TooltipTrigger>
			<TooltipContent side="top">Custom</TooltipContent>
		</Tooltip>
	);
}

export function SelectedPlanRow({
	productId,
	product,
	customItems,
	isCustom,
	badge,
	disabled,
	accessory,
	scope,
	price,
	onEdit,
	onRemove,
}: {
	productId: string;
	product?: ProductV2;
	customItems?: ProductItem[] | null;
	isCustom?: boolean;
	badge?: ReactNode;
	disabled?: boolean;
	accessory?: ReactNode;
	scope?: string;
	price?: ReactNode;
	onEdit?: () => void;
	onRemove?: () => void;
}) {
	const { displayCurrency, productForDisplay } = useCustomerDisplayCurrency();
	const priceProduct =
		product &&
		productForDisplay(getSelectedPlanPriceProduct({ product, customItems }));
	const hasActions = !disabled && (!!onEdit || !!onRemove);
	const name = product?.name ?? productId;

	return (
		<div
			className={cn(
				"group flex h-input min-w-0 w-full items-center gap-2 rounded-lg input-base input-shadow-default px-3 text-sm text-foreground",
				disabled && "opacity-60",
			)}
		>
			<PlanIcon isAddOn={product?.is_add_on === true} isCustom={isCustom} />
			<span className="min-w-0 flex-1 truncate">{name}</span>
			{accessory}
			{scope && (
				<span className="max-w-32 truncate text-xs text-tertiary-foreground">
					{scope}
				</span>
			)}
			<div className="relative flex min-w-[60px] shrink-0 items-center justify-end gap-1.5">
				<div
					className={cn(
						"flex items-center gap-1.5 transition-opacity duration-150",
						hasActions &&
							"group-hover:opacity-0 group-has-[:focus-visible]:opacity-0 [@media(hover:none)]:opacity-0",
					)}
				>
					{badge}
					{price ??
						(priceProduct && (
							<span className="text-xs tabular-nums text-tertiary-foreground">
								<PriceDisplay
									product={priceProduct}
									currency={displayCurrency}
								/>
							</span>
						))}
				</div>
				{hasActions && (
					<div className="absolute right-0 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 [@media(hover:none)]:opacity-100">
						{onEdit && (
							<Button
								variant="skeleton"
								size="icon"
								className="size-6 text-tertiary-foreground hover:text-foreground focus-visible:text-foreground"
								onClick={onEdit}
								aria-label={`Edit ${name}`}
							>
								<PencilSimpleIcon size={13} />
							</Button>
						)}
						{onRemove && (
							<Button
								variant="skeleton"
								size="icon"
								className="size-6 text-tertiary-foreground hover:text-destructive focus-visible:text-destructive"
								onClick={onRemove}
								aria-label={`Remove ${name}`}
							>
								<XIcon size={13} />
							</Button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
