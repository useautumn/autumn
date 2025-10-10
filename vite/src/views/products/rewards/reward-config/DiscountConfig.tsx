import {
	CouponDurationType,
	type ProductItem,
	type Reward,
	RewardType,
} from "@autumn/shared";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useState } from "react";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { isFeatureItem } from "@/utils/product/getItemType";
import { formatProductItemText } from "@/utils/product/product-item/formatProductItem";

export const DiscountConfig = ({
	reward,
	setReward,
}: {
	reward: Reward;
	setReward: (reward: Reward) => void;
}) => {
	const { org } = useOrg();

	const config = reward.discount_config!;
	const setConfig = (key: any, value: any) => {
		setReward({
			...reward,
			discount_config: { ...config, [key]: value },
		});
	};

	return (
		<div className="flex flex-col gap-4 w-full">
			<div className="flex items-center gap-2">
				<div className="w-4/12">
					<FieldLabel>Amount</FieldLabel>
					<Input
						value={config.discount_value}
						onChange={(e) =>
							setConfig("discount_value", Number(e.target.value))
						}
						endContent={
							<p className="text-t3">
								{reward.type === RewardType.PercentageDiscount
									? "%"
									: org?.default_currency || "USD"}
							</p>
						}
					/>
				</div>
				<div className="w-4/12">
					<FieldLabel>Duration</FieldLabel>
					<div className="flex items-center gap-1">
						{config.duration_type === CouponDurationType.Months && (
							<Input
								className="w-[60px] no-spinner"
								value={config.duration_value}
								onChange={(e) => {
									setConfig("duration_value", Number(e.target.value));
								}}
								type="number"
							/>
						)}
						<Select
							value={config.duration_type}
							onValueChange={(value) =>
								setConfig("duration_type", value as CouponDurationType)
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a duration" />
							</SelectTrigger>
							<SelectContent>
								{Object.values(CouponDurationType)
									.filter((type) => {
										if (
											reward.type === RewardType.FixedDiscount &&
											type === CouponDurationType.Forever &&
											config.duration_type !== CouponDurationType.Forever
										) {
											return false;
										}
										if (
											reward.type === RewardType.InvoiceCredits &&
											type === CouponDurationType.OneOff
										) {
											return false;
										}
										return true;
									})
									.map((type) => (
										<SelectItem key={type} value={type}>
											{keyToTitle(type)}
										</SelectItem>
									))}
							</SelectContent>
						</Select>
					</div>
				</div>
			</div>
		<div className="w-4/12">
			<FieldLabel>Maximum Redemptions</FieldLabel>
			<Input
				type="number"
				className="no-spinner"
				value={config.max_redemptions ?? ""}
				onChange={(e) => {
					const { value } = e.target;
					const parsed = value === "" ? undefined : Number(value);
					setConfig("max_redemptions", parsed);
				}}
				placeholder="Unlimited"
			/>
		</div>

			<div className="">
				{/* <p className="text-t2 mb-2 text-t3">Products</p> */}
				<FieldLabel>Products</FieldLabel>

				<ProductPriceSelector reward={reward} setReward={setReward} />
			</div>
		</div>
	);
};

const ProductPriceSelector = ({
	reward,
	setReward,
}: {
	reward: Reward;
	setReward: (reward: Reward) => void;
}) => {
	const { org } = useOrg();
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();

	const [open, setOpen] = useState(false);

	const config = reward.discount_config!;
	const setConfig = (key: any, value: any) => {
		setReward({
			...reward,
			discount_config: { ...config, [key]: value },
		});
	};

	// Handle selection/deselection of a price
	const handlePriceToggle = (priceId: string) => {
		let newPriceIds = [...(config.price_ids || [])];
		if (config.price_ids?.includes(priceId)) {
			newPriceIds = config.price_ids?.filter((id) => id !== priceId) || [];
		} else {
			newPriceIds = [...(config.price_ids || []), priceId];
		}
		setConfig("price_ids", newPriceIds);
	};

	// Handle toggling "Apply to all products"
	const handleApplyToAllToggle = () => {
		const newApplyToAll = !config.apply_to_all;
		// If enabling "Apply to all", clear the price_ids
		if (newApplyToAll) {
			setReward({
				...reward,
				discount_config: {
					...config,
					apply_to_all: newApplyToAll,
					price_ids: [],
				},
			});
		} else {
			setConfig("apply_to_all", newApplyToAll);
		}
	};

	if (!products || products.length === 0) {
		return <p className="text-sm text-t3">No products available</p>;
	}

	return (
		<Popover modal open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className="w-full min-h-9 flex flex-wrap h-fit py-2 justify-start items-center gap-2 relative hover:bg-zinc-50"
				>
					{config.apply_to_all ? (
						<span className="text-t2">All Products</span>
					) : config.price_ids?.length === 0 ? (
						<span className="text-t3">Select products or apply to all</span>
					) : (
						config.price_ids?.map((priceId) => {
							const item = products
								.find((p: any) =>
									p.items.find((i: any) => i.price_id === priceId),
								)
								?.items.find((i: any) => i.price_id === priceId);

							const text = item
								? formatProductItemText({
										item,
										org,
										features,
									})
								: "Unknown Price";
							return (
								<div
									key={priceId}
									className="py-1 px-3 text-xs text-t3 border-zinc-300 bg-zinc-100 rounded-full flex items-center gap-2 h-fit max-w-[200px] min-w-0"
								>
									<p className="truncate flex-1 min-w-0">{text}</p>
									<Button
										variant="ghost"
										size="icon"
										onClick={(e) => {
											e.stopPropagation();
											handlePriceToggle(priceId);
										}}
										className="bg-transparent hover:bg-transparent p-0 w-5 h-5"
									>
										<X size={12} className="text-t3" />
									</Button>
								</div>
							);
						})
					)}
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 absolute right-2" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="p-0"
				align="start"
				style={{ width: "var(--radix-popover-trigger-width)" }}
			>
				<Command>
					<CommandInput placeholder="Search prices..." className="h-9" />
					<CommandList className="max-h-[300px] overflow-y-auto">
						<ScrollArea>
							<CommandEmpty>No prices found.</CommandEmpty>
							<CommandGroup>
								<CommandItem
									onSelect={handleApplyToAllToggle}
									className="cursor-pointer"
								>
									<p>Apply to all products</p>
									{config.apply_to_all && (
										<Check size={12} className="text-t3" />
									)}
								</CommandItem>
							</CommandGroup>
							{!config.apply_to_all &&
								products
									.filter((product: any) => {
										// Filter out products that have no non-feature items
										const nonFeatureItems = product.items?.filter(
											(item: ProductItem) => !isFeatureItem(item),
										);
										return nonFeatureItems && nonFeatureItems.length > 0;
									})
									.map((product: any) => {
										const nonFeatureItems = product.items.filter(
											(item: ProductItem) => !isFeatureItem(item),
										);

										return (
											<CommandGroup key={product.id} heading={product.name}>
												{nonFeatureItems.map((item: any) => (
													<CommandItem
														key={item.price_id}
														value={item.price_id}
														onSelect={() => handlePriceToggle(item.price_id)}
														className="cursor-pointer overflow-x-hidden"
													>
														<span className="truncate overflow-x-hidden">
															{formatProductItemText({
																item,
																org,
																features,
															})}
														</span>

														{config.price_ids?.includes(item.price_id) && (
															<Check size={12} className="text-t3" />
														)}
													</CommandItem>
												))}
											</CommandGroup>
										);
									})}
						</ScrollArea>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
};
