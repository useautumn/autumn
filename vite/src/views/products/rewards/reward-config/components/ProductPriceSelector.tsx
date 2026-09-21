import {
	Checkbox,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@autumn/ui";
import { useEffect } from "react";
import { useProductsByPriceIdsQuery } from "@/hooks/queries/useProductsByPriceIdsQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	ChipSelectTrigger,
	type SelectorChip,
} from "../../components/ChipSelectTrigger";
import type { FrontendReward } from "../../types/frontendReward";
import {
	buildStripeProductGroups,
	expandToFullGroups,
	findGroupForPriceId,
	groupLabel,
	groupSuffix,
	isGroupSelected,
	sharedProductHint,
} from "./stripeProductGroups";

interface ProductPriceSelectorProps {
	reward: FrontendReward;
	setReward: (reward: FrontendReward) => void;
}

export function ProductPriceSelector({
	reward,
	setReward,
}: ProductPriceSelectorProps) {
	const { products } = useProductsQuery();

	const config = reward.discount_config!;
	const priceIds = config.price_ids ?? [];
	const applyToAll = config.apply_to_all ?? false;

	// Selected prices may belong to historical versions absent from the latest list.
	const { products: linkedProductVersions } =
		useProductsByPriceIdsQuery(priceIds);

	const groups = buildStripeProductGroups({
		products: [...products, ...linkedProductVersions],
	});

	const setPriceIds = (nextPriceIds: string[]) =>
		setReward({
			...reward,
			discount_config: {
				...config,
				apply_to_all: false,
				price_ids: nextPriceIds,
			},
		});

	// Coupons saved before grouping may cover part of a shared Stripe product.
	const expandedPriceIds =
		applyToAll || priceIds.length === 0 || groups.length === 0
			? priceIds
			: expandToFullGroups({ groups, priceIds });
	const needsExpanding = expandedPriceIds.some((id) => !priceIds.includes(id));

	const expandedKey = expandedPriceIds.join(",");
	useEffect(() => {
		if (needsExpanding) setPriceIds(expandedPriceIds);
	}, [expandedKey, needsExpanding]);

	const toggleApplyToAll = () =>
		setReward({
			...reward,
			discount_config: {
				...config,
				apply_to_all: !applyToAll,
				price_ids: [],
			},
		});

	const toggleGroup = (groupKey: string) => {
		const group = groups.find(({ key }) => key === groupKey);
		if (!group) return;

		setPriceIds(
			isGroupSelected({ group, priceIds })
				? priceIds.filter((id) => !group.priceIds.includes(id))
				: [
						...priceIds,
						...group.priceIds.filter((id) => !priceIds.includes(id)),
					],
		);
	};

	const buildChips = (): SelectorChip[] => {
		if (applyToAll) return [{ key: "__all__", label: "All products" }];

		const seen = new Set<string>();
		const chips: SelectorChip[] = [];

		for (const priceId of priceIds) {
			const group = findGroupForPriceId({ groups, priceId });
			if (!group || seen.has(group.key)) continue;

			seen.add(group.key);
			chips.push({
				key: group.key,
				label: [groupLabel({ group }), groupSuffix({ group })]
					.filter(Boolean)
					.join(" "),
				onRemove: () =>
					setPriceIds(priceIds.filter((id) => !group.priceIds.includes(id))),
			});
		}

		return chips;
	};

	if (!products || products.length === 0)
		return (
			<p className="text-sm text-tertiary-foreground">No products available</p>
		);

	return (
		<div className="min-w-0 w-full">
			<DropdownMenu>
				<ChipSelectTrigger
					chips={buildChips()}
					placeholder="Select plans or apply to all..."
				/>
				<DropdownMenuContent align="start" className="w-[var(--anchor-width)]">
					<DropdownMenuItem
						className="flex cursor-pointer items-center gap-2 font-medium"
						closeOnClick={false}
						onClick={(e) => {
							e.preventDefault();
							toggleApplyToAll();
						}}
					>
						<Checkbox checked={applyToAll} className="border-border" />
						<span className="truncate">Apply to all products</span>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<div className="max-h-72 overflow-y-auto">
						{groups.map((group) => (
							<DropdownMenuItem
								className="flex cursor-pointer items-center gap-2 font-medium"
								closeOnClick={false}
								key={group.key}
								onClick={(e) => {
									e.preventDefault();
									toggleGroup(group.key);
								}}
							>
								<Checkbox
									checked={!applyToAll && isGroupSelected({ group, priceIds })}
									className="border-border"
								/>
								<span className="truncate">{groupLabel({ group })}</span>
								{groupSuffix({ group }) && (
									<span
										className="shrink-0 text-tertiary-foreground"
										title={sharedProductHint({ group })}
									>
										{groupSuffix({ group })}
									</span>
								)}
							</DropdownMenuItem>
						))}
					</div>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
