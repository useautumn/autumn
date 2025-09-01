import type { Product, ProductItem } from "autumn-js";
import { useCustomer } from "autumn-js/react";
import { Loader2 } from "lucide-react";
import React, { createContext, useContext, useState } from "react";
import CheckoutDialog from "@/components/autumn/checkout-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getPricingTableContent } from "@/lib/autumn/pricing-table-content";
import { cn } from "@/lib/utils";
import { useModelPricingContext } from "@/views/onboarding2/model-pricing/ModelPricingContext";

export default function PricingTable({
	products,
	stripeConnected,
	setConnectStripeOpen,
}: {
	products?: Product[];
	stripeConnected: boolean;
	setConnectStripeOpen: (open: boolean) => void;
}) {
	const { mutateAutumnProducts } = useModelPricingContext();
	const { checkout } = useCustomer();
	const [isAnnual, setIsAnnual] = useState(false);

	const intervals = Array.from(
		new Set(
			products?.map((p) => p.properties?.interval_group).filter((i) => !!i),
		),
	);

	const multiInterval = intervals.length > 1;

	const intervalFilter = (product: Product) => {
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
		<div className={cn("root w-full")}>
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
							className="bg-white"
							buttonProps={{
								disabled:
									(product.scenario === "active" &&
										!product.properties.updateable) ||
									product.scenario === "scheduled",

								onClick: async () => {
									console.log("Inside onClick function");
									if (!stripeConnected) {
										setConnectStripeOpen(true);
										return;
									}

									if (product.id) {
										const _result = await checkout({
											productId: product.id,
											dialog: CheckoutDialog,
											openInNewTab: true,
											successUrl: `${window.location.origin}`,
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
	products: Product[];
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
	products?: Product[];
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
				className={cn("flex items-center flex-col", hasRecommended && "!py-10")}
			>
				{multiInterval && (
					<div
						className={cn(
							products.some((p) => p.display?.recommend_text) && "mb-8",
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
						"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] w-full gap-2 justify-items-center",

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

	const isRecommended = !!productDisplay?.recommend_text;
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
				" w-full h-full py-6 text-foreground border rounded-xs max-w-md shadow-md",
				isRecommended &&
					"lg:-translate-y-6 lg:shadow-lg dark:shadow-zinc-800/80 lg:h-[calc(100%+48px)] bg-secondary/40",
				className,
			)}
		>
			{productDisplay?.recommend_text && (
				<RecommendedBadge recommended={productDisplay?.recommend_text} />
			)}
			<div
				className={cn(
					"flex flex-col h-full flex-grow",
					isRecommended && "lg:translate-y-6",
				)}
			>
				<div className="h-full">
					<div className="flex flex-col">
						<div className="pb-4">
							<h2 className="text-md font-semibold px-6 truncate">
								{productDisplay?.name || name || (
									<span className="text-muted-foreground font-normal">
										Name this product
									</span>
								)}
							</h2>
							{productDisplay?.description && (
								<div className="text-sm text-muted-foreground px-6 h-8">
									<p className="line-clamp-2">{productDisplay?.description}</p>
								</div>
							)}
						</div>
						<div className="mb-2">
							<h3 className="font-semibold h-12 text-sm flex px-6 items-center border-y mb-4 bg-secondary/40">
								<div className="line-clamp-2">
									{mainPriceDisplay?.primary_text}{" "}
									{mainPriceDisplay?.secondary_text && (
										<span className="font-normal text-muted-foreground mt-1">
											{mainPriceDisplay?.secondary_text}
										</span>
									)}
								</div>
							</h3>
						</div>
					</div>
					{showFeatures && featureItems.length > 0 && (
						<div className="flex-grow px-6 mb-6">
							<PricingFeatureList
								items={featureItems}
								everythingFrom={product.display?.everything_from}
							/>
						</div>
					)}
				</div>
				<div className={cn(" px-6 ", isRecommended && "lg:-translate-y-12")}>
					<PricingCardButton
						recommended={!!productDisplay?.recommend_text}
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
	items: ProductItem[];
	everythingFrom?: string;
	className?: string;
}) => {
	return (
		<div className={cn("flex-grow", className)}>
			{everythingFrom && (
				<p className="text-sm mb-4">Everything from {everythingFrom}, plus:</p>
			)}
			<div className="space-y-3">
				{items.map((item, index) => (
					<div key={index} className="flex items-start gap-1 text-sm text-t2">
						<div className="flex flex-col">
							<span>{item.display?.primary_text}</span>
							{item.display?.secondary_text && (
								<span className="text-sm text-muted-foreground">
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
				"w-full py-3 px-4 group overflow-hidden relative transition-all duration-300 hover:brightness-90 border rounded-lg",
				className,
			)}
			{...props}
			variant={recommended ? "default" : "secondary"}
			ref={ref}
			disabled={loading || props.disabled}
			onClick={handleClick}
		>
			{loading ? (
				<Loader2 className="h-4 w-4 animate-spin" />
			) : (
				<>
					<div className="flex items-center justify-between w-full transition-transform duration-300 group-hover:translate-y-[-130%]">
						<span>{children}</span>
						<span className="text-sm">→</span>
					</div>
					<div className="flex items-center justify-between w-full absolute px-4 translate-y-[130%] transition-transform duration-300 group-hover:translate-y-0 mt-2 group-hover:mt-0">
						<span>{children}</span>
						<span className="text-sm">→</span>
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
		<div className="flex items-center space-x-2 mb-4">
			<span className="text-sm text-muted-foreground">Monthly</span>
			<Switch
				id="annual-billing"
				checked={isAnnualToggle}
				onCheckedChange={setIsAnnualToggle}
			/>
			<span className="text-sm text-muted-foreground">Annual</span>
		</div>
	);
};

export const RecommendedBadge = ({ recommended }: { recommended: string }) => {
	return (
		<div className="bg-secondary absolute border text-muted-foreground text-sm font-medium lg:rounded-full px-3 lg:py-0.5 lg:top-4 lg:right-4 top-[-1px] right-[-1px] rounded-bl-lg">
			{recommended}
		</div>
	);
};
