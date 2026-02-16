import type { Autumn } from "@sdk";
import { Loader2 } from "lucide-react";
import React, { createContext, useContext, useState } from "react";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import {
	type ProductDetails,
	type ProductWithDisplay,
	useCustomer,
	usePricingTable,
} from "../../index";
import { cn } from "../../lib/utils";
import { loadingStyles, spinnerStyles } from "../../utils/inject-styles";
import CheckoutDialog from "../checkout-dialog/checkout-dialog-synced";
import { getPricingTableContent } from "./lib/pricing-table-content";

export default function PricingTable({
	productDetails,
}: {
	productDetails?: ProductDetails[];
}) {
	const { customer, checkout } = useCustomer({ errorOnNotFound: false });

	const [isAnnual, setIsAnnual] = useState(false);
	const { products, isLoading, error } = usePricingTable({ productDetails });

	if (isLoading) {
		return (
			<div style={loadingStyles}>
				<Loader2 style={spinnerStyles} />
			</div>
		);
	}

	if (error) {
		return <div> Something went wrong...</div>;
	}

	const intervals = Array.from(
		new Set(
			products?.map((p) => p.properties?.interval_group).filter((i) => !!i),
		),
	);

	const multiInterval = intervals.length > 1;

	const intervalFilter = (product: Autumn.Product) => {
		if (!product.properties?.interval_group) {
			return true;
		}

		if (multiInterval) {
			if (isAnnual) {
				return product.properties?.interval_group === "year";
			} else {
				return product.properties?.interval_group === "month";
			}
		}

		return true;
	};

	return (
		<div className={cn("au-root")}>
			{products && (
				<PricingTableContainer
					products={products}
					isAnnualToggle={isAnnual}
					setIsAnnualToggle={setIsAnnual}
					multiInterval={multiInterval}
				>
					{products.filter(intervalFilter).map((product, index) => (
						<PricingCard
							key={index}
							productId={product.id}
							buttonProps={{
								disabled:
									(product.scenario === "active" &&
										!product.properties?.updateable) ||
									product.scenario === "scheduled",

								onClick: async () => {
									if (product.id && customer) {
										await checkout({
											productId: product.id,
											dialog: CheckoutDialog,
										});
									} else if (product.display?.button_url) {
										window.open(product.display?.button_url, "_blank");
									}
								},
							}}
						/>
					))}
				</PricingTableContainer>
			)}
		</div>
	);
}

const PricingTableContext = createContext<{
	isAnnualToggle: boolean;
	setIsAnnualToggle: (isAnnual: boolean) => void;
	products: ProductWithDisplay[];
	showFeatures: boolean;
}>({
	isAnnualToggle: false,
	setIsAnnualToggle: () => {},
	products: [],
	showFeatures: true,
});

export const usePricingTableContext = (componentName: string) => {
	const context = useContext(PricingTableContext);

	if (context === undefined) {
		throw new Error(`${componentName} must be used within <PricingTable />`);
	}

	return context;
};

export const PricingTableContainer = ({
	children,
	products,
	showFeatures = true,
	className,
	isAnnualToggle,
	setIsAnnualToggle,
	multiInterval,
}: {
	children?: React.ReactNode;
	products?: ProductWithDisplay[];
	showFeatures?: boolean;
	className?: string;
	isAnnualToggle: boolean;
	setIsAnnualToggle: (isAnnual: boolean) => void;
	multiInterval: boolean;
}) => {
	if (!products) {
		throw new Error("products is required in <PricingTable />");
	}

	if (products.length === 0) {
		return <></>;
	}

	const hasRecommended = products?.some((p) => p.display?.recommend_text);
	return (
		<PricingTableContext.Provider
			value={{ isAnnualToggle, setIsAnnualToggle, products, showFeatures }}
		>
			<div
				className={cn(
					"au-flex au-items-center au-flex-col",
					hasRecommended && "!au-py-10",
				)}
			>
				{multiInterval && (
					<div
						className={cn(
							products.some((p) => p.display?.recommend_text) && "au-mb-8",
						)}
					>
						<AnnualSwitch
							isAnnualToggle={isAnnualToggle}
							setIsAnnualToggle={setIsAnnualToggle}
						/>
					</div>
				)}
				<div
					className={cn(
						"au-grid au-grid-cols-1 sm:au-grid-cols-2 lg:au-grid-cols-[repeat(auto-fit,minmax(200px,1fr))] au-w-full au-gap-2",
						className,
					)}
				>
					{children}
				</div>
			</div>
		</PricingTableContext.Provider>
	);
};

interface PricingCardProps {
	productId: string;
	showFeatures?: boolean;
	className?: string;
	onButtonClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
	buttonProps?: React.ComponentProps<"button">;
}

export const PricingCard = ({
	productId,
	className,
	buttonProps,
}: PricingCardProps) => {
	const { products, showFeatures } = usePricingTableContext("PricingCard");

	const product = products.find((p) => p.id === productId);

	if (!product) {
		throw new Error(`Product with id ${productId} not found`);
	}

	const { name, display: productDisplay } = product;

	const { buttonText } = getPricingTableContent(product);

	const isRecommended = productDisplay?.recommend_text ? true : false;
	const mainPriceDisplay = product.properties?.is_free
		? {
				primary_text: "Free",
			}
		: product.items[0].display;

	const featureItems = product.properties?.is_free
		? product.items
		: product.items.slice(1);

	return (
		<div
			className={cn(
				" au-w-full au-h-full au-py-6 au-text-foreground au-border au-rounded-lg au-shadow-sm au-max-w-xl",
				isRecommended &&
					"lg:au--translate-y-6 lg:au-shadow-lg dark:au-shadow-zinc-800/80 lg:au-h-[calc(100%+48px)] au-bg-secondary/40",
				className,
			)}
		>
			{productDisplay?.recommend_text && (
				<RecommendedBadge recommended={productDisplay?.recommend_text} />
			)}
			<div
				className={cn(
					"au-flex au-flex-col au-h-full au-flex-grow",
					isRecommended && "lg:au-translate-y-6",
				)}
			>
				<div className="au-h-full">
					<div className="au-flex au-flex-col">
						<div className="au-pb-4">
							<h2 className="au-text-2xl au-font-semibold au-px-6 au-truncate">
								{productDisplay?.name || name}
							</h2>
							{productDisplay?.description && (
								<div className="au-text-sm au-text-muted-foreground au-px-6 au-h-8">
									<p className="au-line-clamp-2">
										{productDisplay?.description}
									</p>
								</div>
							)}
						</div>
						<div className="au-mb-2">
							<h3 className="au-font-semibold au-h-16 au-flex au-px-6 au-items-center au-border-y au-mb-4 au-bg-secondary/40">
								<div className="au-line-clamp-2">
									{mainPriceDisplay?.primary_text}{" "}
									{mainPriceDisplay?.secondary_text && (
										<span className="au-font-normal au-text-muted-foreground au-mt-1">
											{mainPriceDisplay?.secondary_text}
										</span>
									)}
								</div>
							</h3>
						</div>
					</div>
					{showFeatures && featureItems.length > 0 && (
						<div className="au-flex-grow au-px-6 au-mb-6">
							<PricingFeatureList
								items={featureItems}
								everythingFrom={product.display?.everything_from}
							/>
						</div>
					)}
				</div>
				<div
					className={cn(" au-px-6 ", isRecommended && "lg:au--translate-y-12")}
				>
					<PricingCardButton
						recommended={productDisplay?.recommend_text ? true : false}
						{...buttonProps}
					>
						{productDisplay?.button_text || buttonText}
					</PricingCardButton>
				</div>
			</div>
		</div>
	);
};

// Pricing Feature List
export const PricingFeatureList = ({
	items,
	everythingFrom,
	className,
}: {
	items: Autumn.Products.ProductItem[];
	everythingFrom?: string;
	className?: string;
}) => {
	return (
		<div className={cn("au-flex-grow", className)}>
			{everythingFrom && (
				<p className="au-text-sm au-mb-4">
					Everything from {everythingFrom}, plus:
				</p>
			)}
			<div className="au-space-y-3">
				{items.map((item, index) => (
					<div
						key={index}
						className="au-flex au-items-start au-gap-2 au-text-sm"
					>
						{/* {showIcon && (
              <Check className="au-h-4 au-w-4 au-text-primary au-flex-shrink-0 au-mt-0.5" />
            )} */}
						<div className="au-flex au-flex-col">
							<span>{item.display?.primary_text}</span>
							{item.display?.secondary_text && (
								<span className="au-text-sm au-text-muted-foreground">
									{item.display?.secondary_text}
								</span>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

// Pricing Card Button
export interface PricingCardButtonProps extends React.ComponentProps<"button"> {
	recommended?: boolean;
	buttonUrl?: string;
}

export const PricingCardButton = React.forwardRef<
	HTMLButtonElement,
	PricingCardButtonProps
>(({ recommended, children, className, onClick, ...props }, ref) => {
	const [loading, setLoading] = useState(false);

	const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
		setLoading(true);
		try {
			await onClick?.(e);
		} catch (error) {
			console.error(error);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Button
			className={cn(
				"au-w-full au-py-3 au-px-4 au-group au-overflow-hidden au-relative au-transition-all au-duration-300 hover:au-brightness-90 au-border au-rounded-lg",
				className,
			)}
			{...props}
			variant={recommended ? "default" : "secondary"}
			ref={ref}
			disabled={loading || props.disabled}
			onClick={handleClick}
		>
			{loading ? (
				<Loader2 className="au-h-4 au-w-4 au-animate-spin" />
			) : (
				<>
					<div className="au-flex au-items-center au-justify-between au-w-full au-transition-transform au-duration-300 group-hover:au-translate-y-[-130%]">
						<span>{children}</span>
						<span className="au-text-sm">→</span>
					</div>
					<div className="au-flex au-items-center au-justify-between au-w-full au-absolute au-px-4 au-translate-y-[130%] au-transition-transform au-duration-300 group-hover:au-translate-y-0 au-mt-2 group-hover:au-mt-0">
						<span>{children}</span>
						<span className="au-text-sm">→</span>
					</div>
				</>
			)}
		</Button>
	);
});
PricingCardButton.displayName = "PricingCardButton";

// Annual Switch
export const AnnualSwitch = ({
	isAnnualToggle,
	setIsAnnualToggle,
}: {
	isAnnualToggle: boolean;
	setIsAnnualToggle: (isAnnual: boolean) => void;
}) => {
	return (
		<div className="au-flex au-items-center au-space-x-2 au-mb-4">
			<span className="au-text-sm au-text-muted-foreground">Monthly</span>
			<Switch
				id="annual-billing"
				checked={isAnnualToggle}
				onCheckedChange={setIsAnnualToggle}
			/>
			<span className="au-text-sm au-text-muted-foreground">Annual</span>
		</div>
	);
};

export const RecommendedBadge = ({ recommended }: { recommended: string }) => {
	return (
		<div className="au-bg-secondary au-absolute au-border au-text-muted-foreground au-text-sm au-font-medium lg:au-rounded-full au-px-3 lg:au-py-0.5 lg:au-top-4 lg:au-right-4 au-top-[-1px] au-right-[-1px] au-rounded-bl-lg">
			{recommended}
		</div>
	);
};
