import type { ProductV2 } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { getVersionCounts } from "@/utils/productUtils";
import { getBalanceFilterLabel } from "@/views/customers/components/filter-dropdown/BalanceFilterSubMenu";
import type { FilterCheckboxOption } from "@/views/customers/components/filter-dropdown/FilterCheckboxSubMenu";
import { STATUS_OPTIONS } from "@/views/customers/components/filter-dropdown/FilterStatusSubMenu";
import { INTERVAL_OPTIONS } from "@/views/customers/components/filter-dropdown/IntervalSubMenu";
import { getJoinedLabel } from "@/views/customers/components/filter-dropdown/JoinedDateSubMenu";
import { PROCESSOR_OPTIONS } from "@/views/customers/components/filter-dropdown/ProcessorSubMenu";
import {
	hasActiveBalanceFilter,
	useCustomerFilters,
} from "@/views/customers/hooks/useCustomerFilters";

export type CustomerListFilterChip = {
	key: string;
	label: string;
	value: string;
	onRemove: () => void;
};

const optionLabels = ({
	options,
	values,
}: {
	options: FilterCheckboxOption[];
	values: string[];
}) =>
	values
		.map(
			(value) =>
				options.find((option) => option.value === value)?.label ?? value,
		)
		.join(", ");

/** Lists plans by name, adding versions only when some (not all) versions of a plan are picked. */
const planLabels = ({
	versionKeys,
	products,
}: {
	versionKeys: string[];
	products: ProductV2[];
}) => {
	const versionCounts: Record<string, number> = getVersionCounts(products);
	const versionsByProductId = new Map<string, string[]>();
	for (const key of versionKeys) {
		const [productId, version] = key.split(":");
		versionsByProductId.set(productId, [
			...(versionsByProductId.get(productId) ?? []),
			version,
		]);
	}

	return [...versionsByProductId].map(([productId, versions]) => {
		const name =
			products.find((product) => product.id === productId)?.name ?? productId;
		const hasEveryVersion = versions.length >= (versionCounts[productId] ?? 1);
		return hasEveryVersion
			? name
			: `${name} ${versions.map((version) => `v${version}`).join(", ")}`;
	});
};

export function useCustomerListFilterChips(): CustomerListFilterChip[] {
	const { queryStates, setFilters } = useCustomerFilters();
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();

	const chips: CustomerListFilterChip[] = [];

	if (queryStates.status.length > 0) {
		chips.push({
			key: "status",
			label: "Status",
			value: optionLabels({
				options: STATUS_OPTIONS,
				values: queryStates.status,
			}),
			onRemove: () => setFilters({ status: [] }),
		});
	}

	if (queryStates.version.length > 0 || queryStates.none) {
		const plans = planLabels({
			versionKeys: queryStates.version,
			products: products ?? [],
		});
		chips.push({
			key: "plan",
			label: "Plan",
			value: [...plans, ...(queryStates.none ? ["No plan"] : [])].join(", "),
			onRemove: () => setFilters({ version: [], none: false }),
		});
	}

	if (queryStates.interval.length > 0) {
		chips.push({
			key: "interval",
			label: "Interval",
			value: optionLabels({
				options: INTERVAL_OPTIONS,
				values: queryStates.interval,
			}),
			onRemove: () => setFilters({ interval: [] }),
		});
	}

	if (queryStates.processor.length > 0) {
		chips.push({
			key: "processor",
			label: "Processor",
			value: optionLabels({
				options: PROCESSOR_OPTIONS,
				values: queryStates.processor,
			}),
			onRemove: () => setFilters({ processor: [] }),
		});
	}

	if (hasActiveBalanceFilter(queryStates)) {
		const featureName =
			features?.find((feature) => feature.id === queryStates.balanceFeature)
				?.name ?? queryStates.balanceFeature;
		chips.push({
			key: "balance",
			label: "Balance",
			value: getBalanceFilterLabel({
				basis: queryStates.balanceBasis,
				featureName,
				op: queryStates.balanceOp,
				value: queryStates.balanceValue,
			}),
			onRemove: () =>
				setFilters({
					balanceFeature: "",
					balanceOp: ">",
					balanceValue: "",
					balanceBasis: "usage",
				}),
		});
	}

	const joinedLabel = getJoinedLabel({
		from: queryStates.joinedFrom,
		to: queryStates.joinedTo,
	});
	if (joinedLabel) {
		chips.push({
			key: "joined",
			label: "Joined",
			value: joinedLabel,
			onRemove: () => setFilters({ joinedFrom: null, joinedTo: null }),
		});
	}

	return chips;
}
