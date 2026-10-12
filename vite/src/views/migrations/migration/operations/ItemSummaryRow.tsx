import { ItemRateChangeRow } from "@/components/v2/ItemRateChangeRow";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import type { RateChange } from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";
import { migrationItemToProductItem } from "../shared/migrationItemUtils";

const NO_RATE_CHANGES: RateChange[] = [];

export function ItemSummaryRow({
	item,
	onClick,
	changes = NO_RATE_CHANGES,
	updated = false,
}: {
	item: Record<string, unknown>;
	onClick?: () => void;
	changes?: RateChange[];
	updated?: boolean;
}) {
	const { features } = useFeaturesQuery();
	const productItem = migrationItemToProductItem(item, features);

	return (
		<ItemRateChangeRow
			changes={changes}
			compact
			onClick={onClick}
			updated={updated}
		>
			<PlanItemLabel item={productItem} unnamedText="Unconfigured" />
		</ItemRateChangeRow>
	);
}
