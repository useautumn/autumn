import type { FullCusProduct, FullCustomerEntitlement } from "@autumn/shared";
import { Link } from "react-router";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useEnv } from "@/utils/envUtils";
import { getRedirectUrl } from "@/utils/genUtils";
import { RateCardTable } from "@/views/products/features/credit-systems/components/rate-card/RateCardTable";
import { rateCardRows } from "@/views/products/features/credit-systems/utils/rateCardRows";
import { BalanceRateCardRow } from "./BalanceRateCardRow";

/** The full rate card a credit balance pays, and which rates its plan set. */
export function BalanceRateCard({
	selectedCusEnt,
	cusProduct,
}: {
	selectedCusEnt: FullCustomerEntitlement;
	cusProduct: FullCusProduct | undefined;
}) {
	const env = useEnv();
	const { features } = useFeaturesQuery();
	const { feature: creditSystem, feature_override: override } =
		selectedCusEnt.entitlement;
	if (!override?.schema?.length) return null;

	const product = cusProduct?.product;
	const sources = {
		inherited: `From ${creditSystem.name}`,
		changed: `Set on ${product?.name ?? "this plan"}`,
		added: `Set on ${product?.name ?? "this plan"}`,
		excluded: `Removed on ${product?.name ?? "this plan"}`,
	};

	return (
		<SheetSection withSeparator>
			<RateCardTable
				subtitle="What this balance pays for each feature"
				action={
					product && (
						<Link
							className="px-1.5 py-1 text-subtle text-xs transition-colors hover:text-muted-foreground"
							to={getRedirectUrl(
								`/products/${product.id}?version=${product.version}`,
								env,
							)}
						>
							Edit on plan
						</Link>
					)
				}
			>
				{rateCardRows({ override: override.schema, creditSystem }).map(
					(row) => (
						<BalanceRateCardRow
							key={row.featureId}
							row={row}
							features={features}
							source={sources[row.state]}
						/>
					),
				)}
			</RateCardTable>
		</SheetSection>
	);
}
