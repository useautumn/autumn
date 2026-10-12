import type { FullCusProduct, FullCustomerEntitlement } from "@autumn/shared";
import { Link } from "react-router";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useEnv } from "@/utils/envUtils";
import { getRedirectUrl } from "@/utils/genUtils";
import { RateCardHeader } from "@/views/products/features/credit-systems/components/rate-card/RateCardHeader";
import { RateCardTray } from "@/views/products/features/credit-systems/components/rate-card/RateCardTray";
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

	const { rows } = rateCardRows({ override: override.schema, creditSystem });
	const product = cusProduct?.product;

	return (
		<SheetSection withSeparator>
			<div className="flex flex-col gap-2.5">
				<RateCardHeader
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
				/>
				<RateCardTray>
					{rows.map((row) => (
						<BalanceRateCardRow
							key={row.featureId}
							row={row}
							features={features}
							planName={product?.name ?? "this plan"}
							creditSystemName={creditSystem.name}
						/>
					))}
				</RateCardTray>
			</div>
		</SheetSection>
	);
}
