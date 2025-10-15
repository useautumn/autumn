import {
	mapToProductV3,
	type ProductItem,
	productV2ToFeatureItems,
} from "@autumn/shared";
import type { Product } from "autumn-js";
import { Button } from "@/components/v2/buttons/Button";
import { Card, CardContent, CardHeader } from "@/components/v2/cards/Card";
import { Separator } from "@/components/v2/separator";
import { cn } from "@/lib/utils";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { CodeSpan } from "@/views/onboarding2/integrate/components/CodeSpan";
import { PlanFeatureIcon } from "@/views/products/plan/components/plan-card/PlanFeatureIcon";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../v2/tooltips/Tooltip";

interface PlanCardPreviewProps {
	product: Product;
	buttonText?: string;
	onButtonClick?: () => void;
	recommended?: boolean;
	disabled?: boolean;
}

// Custom dot component
const CustomDotIcon = () => {
	return <div className="w-[2px] h-[2px] mx-0.5 bg-current rounded-full" />;
};

// Simplified feature row for preview (non-interactive)
const PlanFeatureRowPreview = ({ item }: { item: ProductItem }) => {
	// Use pre-computed display if available, otherwise compute it
	const display = item.display || { primary_text: "", secondary_text: "" };

	return (
		<div className="flex w-full h-9 items-center px-2 rounded-lg border border-border bg-white">
			{/* Left side - Icons and text */}
			<div className="flex flex-row items-center flex-1 gap-3 min-w-0">
				<div className="flex flex-row items-center gap-1 flex-shrink-0">
					<PlanFeatureIcon item={item} position="left" />
					<CustomDotIcon />
					<PlanFeatureIcon item={item} position="right" />
				</div>

				<div className="flex items-center gap-2 flex-1 min-w-0">
					<p className="whitespace-nowrap truncate max-w-full">
						<span className="text-body">{display.primary_text}</span>
						{display.secondary_text && (
							<span className="text-body-secondary">
								{" "}
								{display.secondary_text}
							</span>
						)}
					</p>
				</div>
			</div>
		</div>
	);
};

export const PlanCardPreview = ({
	product,
	buttonText = "Subscribe",
	onButtonClick,
	recommended = false,
	disabled = false,
}: PlanCardPreviewProps) => {
	const productV3 = mapToProductV3({ product });
	const featureItems = productV2ToFeatureItems({ items: product.items });

	return (
		<Card
			className={cn(
				"min-w-[280px] max-w-md bg-white shadow-md flex flex-col border-none shadow-[inset_0_0_0_0.5px_var(--t10)] !gap-0",
				recommended && "ring-2 ring-primary",
			)}
		>
			<CardHeader className="flex flex-col !gap-0">
				<div className="flex flex-col gap-2">
					{/* Title */}
					<h3 className="text-sub">{product.name}</h3>

					{/* Price */}
					{productV3.price?.amount ? (
						<span className="text-main">
							${productV3.price.amount}/
							{keyToTitle(productV3.price.interval ?? "once", {
								exclusionMap: { one_off: "once" },
							}).toLowerCase()}
						</span>
					) : (
						<span className="text-main">Free</span>
					)}

					{/* Description */}
					{productV3.description && (
						<p className="text-body-secondary line-clamp-2">
							{productV3.description}
						</p>
					)}
				</div>

				<Separator className="my-3" />
			</CardHeader>

			<CardContent className="flex flex-col flex-1 gap-4 !pt-0">
				{/* Feature list */}
				{featureItems.length > 0 && (
					<div className="space-y-2">
						{featureItems.map((item, index) => (
							<PlanFeatureRowPreview
								key={item.feature_id || index}
								item={item}
							/>
						))}
					</div>
				)}

				{/* Action button */}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant={recommended ? "primary" : "secondary"}
							className="w-full relative overflow-hidden group mt-auto"
							onClick={onButtonClick}
							disabled={disabled}
						>
							<div className="flex items-center justify-center gap-2 w-full transition-transform duration-300 group-hover:translate-y-[-130%]">
								<span>{buttonText}</span>
								<svg
									width="14"
									height="14"
									viewBox="0 0 14 14"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
								>
									<title>Arrow Right</title>
									<path
										d="M11.3316 5.8187L11.3311 2.66919L8.18164 2.6687"
										stroke="currentColor"
										strokeWidth="0.9"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
									<path
										d="M7.39453 6.6062L11.332 2.6687"
										stroke="currentColor"
										strokeWidth="0.9"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
									<path
										d="M9.75547 7.39365V10.9374C9.75547 11.0418 9.71399 11.142 9.64014 11.2158C9.5663 11.2897 9.46615 11.3312 9.36172 11.3312H3.06172C2.95729 11.3312 2.85714 11.2897 2.7833 11.2158C2.70945 11.142 2.66797 11.0418 2.66797 10.9374V4.6374C2.66797 4.53297 2.70945 4.43282 2.7833 4.35898C2.85714 4.28514 2.95729 4.24365 3.06172 4.24365H6.60547"
										stroke="currentColor"
										strokeWidth="0.9"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							</div>
							<div className="flex items-center justify-center gap-2 w-full absolute left-0 right-0 px-[7px] translate-y-[130%] transition-transform duration-300 group-hover:translate-y-0 mt-2 group-hover:mt-0">
								<span>{buttonText}</span>
								<svg
									width="14"
									height="14"
									viewBox="0 0 14 14"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
								>
									<title>Arrow Right</title>
									<path
										d="M11.3316 5.8187L11.3311 2.66919L8.18164 2.6687"
										stroke="currentColor"
										strokeWidth="0.9"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
									<path
										d="M7.39453 6.6062L11.332 2.6687"
										stroke="currentColor"
										strokeWidth="0.9"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
									<path
										d="M9.75547 7.39365V10.9374C9.75547 11.0418 9.71399 11.142 9.64014 11.2158C9.5663 11.2897 9.46615 11.3312 9.36172 11.3312H3.06172C2.95729 11.3312 2.85714 11.2897 2.7833 11.2158C2.70945 11.142 2.66797 11.0418 2.66797 10.9374V4.6374C2.66797 4.53297 2.70945 4.43282 2.7833 4.35898C2.85714 4.28514 2.95729 4.24365 3.06172 4.24365H6.60547"
										stroke="currentColor"
										strokeWidth="0.9"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							</div>
						</Button>
					</TooltipTrigger>
					<TooltipContent className="justify-center text-center items-center">
						When checking out in test mode - <br />
						use <CodeSpan>4242 4242 4242 4242</CodeSpan> as the card number,
						<br /> <CodeSpan>04/42</CodeSpan> as the expiry date, and{" "}
						<CodeSpan>any CVC</CodeSpan>.
					</TooltipContent>
				</Tooltip>
			</CardContent>
		</Card>
	);
};
