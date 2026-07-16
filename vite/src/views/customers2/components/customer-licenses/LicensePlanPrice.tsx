import type { ProductV2 } from "@autumn/shared";
import {
	formatAmount,
	formatInterval,
	productV2ToBasePrice,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import {
	CheckCircleIcon,
	CurrencyCircleDollarIcon,
	TagIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";

interface PriceTooltipRow {
	icon: ReactNode;
	label: string;
	value: string;
}

const seatsWord = (quantity: number) => (quantity === 1 ? "seat" : "seats");

/** Price cell for a license pool row. A mixed included/paid pool has no
 * single price, so it reads "Varies" with the breakdown in a tooltip. */
export function LicensePlanPrice({
	product,
	includedQuantity,
	paidQuantity,
}: {
	product: ProductV2 | null;
	includedQuantity: number;
	paidQuantity: number;
}) {
	const { displayCurrency, productForDisplay } = useCustomerDisplayCurrency();

	if (!product) {
		return <div className="text-tertiary-foreground">-</div>;
	}

	const basePrice = product.items?.length
		? productV2ToBasePrice({
				product: productForDisplay(productV2ToFrontendProduct({ product })),
			})
		: null;
	const hasSeatPrice = basePrice != null && basePrice.price > 0;

	const seatAmount = ({ quantity }: { quantity: number }) =>
		formatAmount({
			currency: displayCurrency,
			amount: (basePrice?.price ?? 0) * quantity,
			amountFormatOptions: {
				style: "currency",
				currencyDisplay: "narrowSymbol",
			},
		});
	const intervalText = basePrice?.interval
		? formatInterval({
				interval: basePrice.interval,
				intervalCount: basePrice.interval_count,
			})
		: "one-off";

	const hasPaidSeats = hasSeatPrice && paidQuantity > 0;
	const isMixedPool = hasPaidSeats && includedQuantity > 0;

	let priceCell = <div className="text-tertiary-foreground">Free</div>;
	if (isMixedPool) {
		priceCell = <div className="text-tertiary-foreground">Varies</div>;
	} else if (hasPaidSeats) {
		priceCell = (
			<div className="flex items-center gap-1 truncate">
				<span className="text-muted-foreground">
					{seatAmount({ quantity: 1 })}
				</span>
				<span className="truncate text-tertiary-foreground">
					per seat {intervalText}
				</span>
			</div>
		);
	}

	const tooltipRows = [
		includedQuantity > 0 && {
			icon: (
				<CheckCircleIcon
					size={14}
					weight="duotone"
					className="text-green-600 dark:text-green-500"
				/>
			),
			label: `${includedQuantity} included ${seatsWord(includedQuantity)}`,
			value: "Free",
		},
		hasPaidSeats && {
			icon: (
				<CurrencyCircleDollarIcon
					size={14}
					weight="duotone"
					className="text-blue-600 dark:text-blue-500"
				/>
			),
			label: `${paidQuantity} paid ${seatsWord(paidQuantity)}`,
			value: `${seatAmount({ quantity: paidQuantity })} ${intervalText}`,
		},
		hasSeatPrice && {
			icon: (
				<TagIcon
					size={14}
					weight="duotone"
					className="text-purple-600 dark:text-purple-500"
				/>
			),
			label: "Price per seat",
			value: `${seatAmount({ quantity: 1 })} ${intervalText}`,
		},
	].filter(Boolean) as PriceTooltipRow[];

	if (tooltipRows.length === 0) {
		return priceCell;
	}

	return (
		<Tooltip delayDuration={0}>
			<TooltipTrigger asChild>
				<div className="w-fit cursor-default">{priceCell}</div>
			</TooltipTrigger>
			<TooltipContent>
				<div className="flex flex-col gap-1.5 py-0.5">
					{tooltipRows.map((row) => (
						<div
							key={row.label}
							className="flex items-center justify-between gap-6"
						>
							<span className="flex items-center gap-1.5">
								{row.icon}
								{row.label}
							</span>
							<span className="tabular-nums">{row.value}</span>
						</div>
					))}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
