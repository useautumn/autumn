"use client";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
// import type { CheckoutParams, CheckoutResult, ProductItem } from "@sdk";
import type { Autumn } from "@sdk";
import { ArrowRight, ChevronDown, Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
} from "../ui/accordion";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "../ui/popover";
import { useCustomer } from "../../index";
import { cn } from "../../lib/utils";
import { getCheckoutContent } from "./lib/checkout-content";

export interface CheckoutDialogProps {
	open: boolean;
	setOpen: (open: boolean) => void;
	checkoutResult: Autumn.CheckoutResponse;
	checkoutParams?: Autumn.CheckoutParams;
}

const formatCurrency = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}) => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency,
	}).format(amount);
};

export default function CheckoutDialog(params: CheckoutDialogProps) {
	const { attach } = useCustomer();
	const [checkoutResult, setCheckoutResult] = useState<
		Autumn.CheckoutResponse | undefined
	>(params?.checkoutResult);

	useEffect(() => {
		if (params.checkoutResult) {
			setCheckoutResult(params.checkoutResult);
		}
	}, [params.checkoutResult]);

	const [loading, setLoading] = useState(false);

	if (!checkoutResult) {
		return <></>;
	}

	const { open, setOpen } = params;
	const { title, message } = getCheckoutContent(checkoutResult);

	const isFree = checkoutResult?.product?.properties?.is_free;
	const isPaid = isFree === false;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="au-p-0 au-pt-4 au-gap-0 au-text-foreground au-text-sm">
				<DialogTitle className="au-px-6 au-mb-1">{title}</DialogTitle>
				<div className="au-px-6 au-mt-1 au-mb-4 au-text-muted-foreground">
					{message}
				</div>

				{isPaid && checkoutResult && (
					<PriceInformation
						checkoutResult={checkoutResult}
						setCheckoutResult={setCheckoutResult}
					/>
				)}

				<DialogFooter className="au-flex au-flex-col sm:au-flex-row au-justify-between au-gap-x-4 au-py-2 au-pl-6 au-pr-3 au-bg-secondary au-border-t au-shadow-inner">
					<Button
						size="sm"
						onClick={async () => {
							setLoading(true);

							const options = checkoutResult.options?.map(
								(option: Autumn.CheckoutResponse.Option) => {
									return {
										featureId: option.feature_id,
										quantity: option.quantity,
									};
								},
							);

							await attach({
								productId: checkoutResult.product?.id,
								...(params.checkoutParams || {}),
								options,
							});
							setOpen(false);
							setLoading(false);
						}}
						disabled={loading}
						className="au-min-w-16 au-flex au-items-center au-gap-2"
					>
						{loading ? (
							<Loader2 className="au-w-4 au-h-4 au-animate-spin" />
						) : (
							<>
								<span className="au-whitespace-nowrap au-flex au-gap-1">
									Confirm
								</span>
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function PriceInformation({
	checkoutResult,
	setCheckoutResult,
}: {
	checkoutResult: Autumn.CheckoutResponse;
	setCheckoutResult: (checkoutResult: Autumn.CheckoutResponse) => void;
}) {
	return (
		<div className="au-px-6 au-mb-4 au-flex au-flex-col au-gap-4">
			<ProductItems
				checkoutResult={checkoutResult}
				setCheckoutResult={setCheckoutResult}
			/>

			<div className="au-flex au-flex-col au-gap-2">
				{checkoutResult?.has_prorations && checkoutResult.lines.length > 0 && (
					<CheckoutLines checkoutResult={checkoutResult} />
				)}
				<DueAmounts checkoutResult={checkoutResult} />
			</div>
		</div>
	);
}

function DueAmounts({
	checkoutResult,
}: {
	checkoutResult: Autumn.CheckoutResponse;
}) {
	const { next_cycle, product } = checkoutResult;
	const nextCycleAtStr = next_cycle
		? new Date(next_cycle.starts_at).toLocaleDateString()
		: undefined;

	const hasUsagePrice = product?.items.some(
		(item) => item.usage_model === "pay_per_use",
	);

	const showNextCycle = next_cycle && next_cycle.total !== checkoutResult.total;

	return (
		<div className="au-flex au-flex-col au-gap-1">
			<div className="au-flex au-justify-between">
				<div>
					<p className="au-font-medium au-text-md">Total due today</p>
				</div>

				<p className="au-font-medium au-text-md">
					{formatCurrency({
						amount: checkoutResult?.total ?? 0,
						currency: checkoutResult?.currency ?? "usd",
					})}
				</p>
			</div>
			{showNextCycle && (
				<div className="au-flex au-justify-between au-text-muted-foreground">
					<div>
						<p className="au-text-md">Due next cycle ({nextCycleAtStr})</p>
					</div>
					<p className="au-text-md">
						{formatCurrency({
							amount: next_cycle.total ?? 0,
							currency: checkoutResult?.currency ?? "usd",
						})}
						{hasUsagePrice && <span> + usage prices</span>}
					</p>
				</div>
			)}
		</div>
	);
}

function ProductItems({
	checkoutResult,
	setCheckoutResult,
}: {
	checkoutResult: Autumn.CheckoutResponse;
	setCheckoutResult: (checkoutResult: Autumn.CheckoutResponse) => void;
}) {
	const isUpdateQuantity =
		checkoutResult?.product?.scenario === "active" &&
		checkoutResult.product?.properties?.updateable;

	const isOneOff = checkoutResult?.product?.properties?.is_one_off;

	return (
		<div className="au-flex au-flex-col au-gap-2">
			<p className="au-text-sm au-font-medium">Price</p>
			{checkoutResult?.product?.items
				.filter((item: Autumn.ProductItem) => item.type !== "feature")
				.map((item, index) => {
					if (item.usage_model == "prepaid") {
						return (
							<PrepaidItem
								key={index}
								item={item}
								checkoutResult={checkoutResult!}
								setCheckoutResult={setCheckoutResult}
							/>
						);
					}

					if (isUpdateQuantity) {
						return null;
					}

					return (
						<div key={index} className="au-flex au-justify-between">
							<p className="au-text-muted-foreground">
								{item.feature
									? item.feature.name
									: isOneOff
										? "Price"
										: "Subscription"}
							</p>
							<p>
								{item.display?.primary_text} {item.display?.secondary_text}
							</p>
						</div>
					);
				})}
		</div>
	);
}

function CheckoutLines({
	checkoutResult,
}: {
	checkoutResult: Autumn.CheckoutResponse;
}) {
	return (
		<Accordion type="single" collapsible>
			<AccordionItem value="total" className="au-border-b-0">
				<CustomAccordionTrigger className="au-justify-between au-w-full au-my-0 au-py-0 au-border-none">
					<div className="au-cursor-pointer au-flex au-items-center au-gap-1 au-w-full au-justify-end">
						<p className="au-font-light au-text-muted-foreground">
							View details
						</p>
						<ChevronDown
							className="au-text-muted-foreground au-mt-0.5 au-rotate-90 au-transition-transform au-duration-200 au-ease-in-out"
							size={14}
						/>
					</div>
				</CustomAccordionTrigger>
				<AccordionContent className="au-mt-2 au-mb-0 au-pb-2 au-flex au-flex-col au-gap-2">
					{checkoutResult?.lines
						.filter((line: Autumn.CheckoutResponse.Line) => line.amount !== 0)
						.map((line, index) => {
							return (
								<div key={index} className="au-flex au-justify-between">
									<p className="au-text-muted-foreground">{line.description}</p>
									<p className="au-text-muted-foreground">
										{new Intl.NumberFormat("en-US", {
											style: "currency",
											currency: checkoutResult?.currency ?? "usd",
										}).format(line.amount)}
									</p>
								</div>
							);
						})}
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}

function CustomAccordionTrigger({
	className,
	children,
	...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
	return (
		<AccordionPrimitive.Header className="au-flex">
			<AccordionPrimitive.Trigger
				data-slot="accordion-trigger"
				className={cn(
					"focus-visible:au-border-ring focus-visible:au-ring-ring/50 au-flex au-flex-1 au-items-start au-justify-between au-gap-4 au-rounded-md au-py-4 au-text-left au-text-sm au-font-medium au-transition-all au-outline-none focus-visible:au-ring-[3px] disabled:au-pointer-events-none disabled:au-opacity-50 [&[data-state=open]_svg]:au-rotate-0",
					className,
				)}
				{...props}
			>
				{children}
			</AccordionPrimitive.Trigger>
		</AccordionPrimitive.Header>
	);
}

const PrepaidItem = ({
	item,
	checkoutResult,
	setCheckoutResult,
}: {
	item: Autumn.ProductItem;
	checkoutResult: Autumn.CheckoutResponse;
	setCheckoutResult: (checkoutResult: Autumn.CheckoutResponse) => void;
}) => {
	let { quantity = 0, billing_units: billingUnits = 1 } = item;
	quantity = quantity ?? 0;
	billingUnits = billingUnits ?? 1;

	const [quantityInput, setQuantityInput] = useState<string>(
		(quantity / billingUnits).toString(),
	);
	const { checkout } = useCustomer();
	const [loading, setLoading] = useState(false);
	const [open, setOpen] = useState(false);
	const scenario = checkoutResult.product?.scenario;

	const handleSave = async () => {
		setLoading(true);
		try {
			const newOptions = (checkoutResult.options ?? [])
				.filter((option) => option.feature_id !== item.feature_id)
				.map((option) => {
					return {
						featureId: option.feature_id,
						quantity: option.quantity,
					};
				});

			newOptions.push({
				featureId: item.feature_id!,
				quantity: Number(quantityInput) * billingUnits,
			});

			const data = await checkout({
				productId: checkoutResult.product?.id,
				options: newOptions,
				dialog: CheckoutDialog,
			});

			setCheckoutResult(data!);
		} catch (error) {
			console.error(error);
		} finally {
			setLoading(false);
			setOpen(false);
		}
	};

	const disableSelection = scenario === "renew";

	return (
		<div className="au-flex au-justify-between au-gap-2">
			<div className="au-flex au-gap-2 au-items-start">
				<p className="au-text-muted-foreground au-whitespace-nowrap">
					{item.feature?.name}
				</p>
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger
						className={cn(
							"au-text-muted-foreground au-text-xs au-px-1 au-py-0.5 au-rounded-md au-flex au-items-center au-gap-1 au-bg-accent/80 au-shrink-0",
							disableSelection !== true &&
								"hover:au-bg-accent hover:au-text-foreground",
							disableSelection &&
								"au-pointer-events-none au-opacity-80 au-cursor-not-allowed",
						)}
						disabled={disableSelection}
					>
						Qty: {quantity}
						{!disableSelection && <ChevronDown size={12} />}
					</PopoverTrigger>
					<PopoverContent
						align="start"
						className="au-w-80 au-text-sm au-p-4 au-pt-3 au-flex au-flex-col au-gap-4"
					>
						<div className="au-flex au-flex-col au-gap-1">
							<p className="au-text-sm au-font-medium">{item.feature?.name}</p>
							<p className="au-text-muted-foreground">
								{item.display?.primary_text} {item.display?.secondary_text}
							</p>
						</div>

						<div className="au-flex au-justify-between au-items-end">
							<div className="au-flex au-gap-2 au-items-center">
								<Input
									className="au-h-7 au-w-16 focus:!au-ring-2"
									value={quantityInput}
									onChange={(e) => setQuantityInput(e.target.value)}
								/>
								<p className="au-text-muted-foreground">
									{billingUnits > 1 && `x ${billingUnits} `}
									{item.feature?.name}
								</p>
							</div>

							<Button
								onClick={handleSave}
								className="au-w-14 !au-h-7 au-text-sm au-items-center au-bg-white au-text-foreground au-shadow-sm au-border au-border-zinc-200 hover:au-bg-zinc-100"
								disabled={loading}
							>
								{loading ? (
									<Loader2 className="au-text-muted-foreground au-animate-spin !au-w-4 !au-h-4" />
								) : (
									"Save"
								)}
							</Button>
						</div>
					</PopoverContent>
				</Popover>
			</div>
			<p className="au-text-end">
				{item.display?.primary_text} {item.display?.secondary_text}
			</p>
		</div>
	);
};

export const PriceItem = ({
	children,
	className,
	...props
}: {
	children: React.ReactNode;
	className?: string;
} & React.HTMLAttributes<HTMLDivElement>) => {
	return (
		<div
			className={cn(
				"au-flex au-flex-col au-pb-4 sm:au-pb-0 au-gap-1 sm:au-flex-row au-justify-between sm:au-h-7 sm:au-gap-2 sm:au-items-center",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
};

export const PricingDialogButton = ({
	children,
	size,
	onClick,
	disabled,
	className,
}: {
	children: React.ReactNode;
	size?: "sm" | "lg" | "default" | "icon";
	onClick: () => void;
	disabled?: boolean;
	className?: string;
}) => {
	return (
		<Button
			onClick={onClick}
			disabled={disabled}
			size={size}
			className={cn(className, "au-shadow-sm au-shadow-stone-400")}
		>
			{children}
			<ArrowRight className="!au-h-3" />
		</Button>
	);
};
