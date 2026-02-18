import type { FrontendProduct } from "@autumn/shared";
import { motion } from "motion/react";
import { PriceDisplay } from "@/components/forms/update-subscription-v2/components/PriceDisplay";
import { STAGGER_ITEM_LAYOUT } from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";

interface PriceChange {
	oldPrice: string;
	newPrice: string;
	oldIntervalText: string | null;
	newIntervalText: string | null;
	isUpgrade: boolean;
}

export function PlanPriceHeader({
	priceChange,
	product,
	currency,
	useStagger,
}: {
	priceChange?: PriceChange | null;
	product: FrontendProduct | undefined;
	currency: string;
	useStagger?: boolean;
}) {
	const content = priceChange ? (
		<span className="flex items-center gap-1.5">
			<span className="text-t3">
				{priceChange.oldPrice}
				{priceChange.oldIntervalText && ` ${priceChange.oldIntervalText}`}
			</span>
			<span className="text-t4">-&gt;</span>
			<span className="font-semibold text-t1">{priceChange.newPrice}</span>
			<span className="text-t3">{priceChange.newIntervalText}</span>
		</span>
	) : (
		<PriceDisplay product={product} currency={currency} />
	);

	if (useStagger) {
		return (
			<motion.div
				layout="position"
				transition={{ layout: LAYOUT_TRANSITION }}
				variants={STAGGER_ITEM_LAYOUT}
				className="flex gap-2 justify-between items-center"
			>
				{content}
			</motion.div>
		);
	}

	return (
		<div className="flex gap-2 justify-between items-center mb-3">
			{content}
		</div>
	);
}
