import type { FullCusProduct, FullCustomerEntitlement } from "@autumn/shared";
import { CoinsIcon } from "@phosphor-icons/react";
import { Link } from "react-router";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useEnv } from "@/utils/envUtils";
import { getRedirectUrl } from "@/utils/genUtils";
import { RateCardRow } from "@/views/products/features/credit-systems/components/rate-card/RateCardRow";
import { RateCardTable } from "@/views/products/features/credit-systems/components/rate-card/RateCardTable";
import { rateCardRows } from "@/views/products/features/credit-systems/utils/rateCardRows";
import { OverrideRow } from "./OverrideRow";

const countLabel = (count: number, noun: string) =>
	`${count} ${noun}${count === 1 ? "" : "s"}`;

export function FeatureOverrideSection({
	selectedCusEnt,
	cusProduct,
}: {
	selectedCusEnt: FullCustomerEntitlement;
	cusProduct?: FullCusProduct;
}) {
	const env = useEnv();
	const { features } = useFeaturesQuery();
	const { feature: creditSystem, feature_override } =
		selectedCusEnt.entitlement;
	const markups = feature_override?.markups;
	const product = cusProduct?.product;

	if (feature_override?.schema?.length)
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
					{rateCardRows({
						override: feature_override.schema,
						catalog: creditSystem.config?.schema ?? [],
					}).map((row) => (
						<RateCardRow
							key={row.featureId}
							row={row}
							features={features}
							planName={product?.name ?? "this plan"}
							creditSystemName={creditSystem.name}
						/>
					))}
				</RateCardTable>
			</SheetSection>
		);
	if (!markups) return null;

	const providerMarkups = Object.entries(markups.provider_markups ?? {});
	const modelMarkupCount = Object.keys(markups.model_markups ?? {}).length;

	return (
		<SheetSection withSeparator>
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-1.5 text-tertiary-foreground text-sm font-medium">
					<CoinsIcon size={14} weight="duotone" />
					Custom markup
				</div>

				<div className="flex flex-col gap-1.5">
					<OverrideRow
						label="Default"
						value={`${markups.default_markup ?? 0}% markup`}
					/>
					{providerMarkups.map(([providerKey, entry]) => (
						<OverrideRow
							key={`provider-${providerKey}`}
							label={providerKey}
							value={`${entry?.markup ?? 0}% markup`}
						/>
					))}
					{modelMarkupCount > 0 && (
						<OverrideRow
							label="Per-model"
							value={countLabel(modelMarkupCount, "model")}
						/>
					)}
				</div>

				<div className="text-xs text-subtle px-2">
					Overrides the credit system's defaults for this plan.
				</div>
			</div>
		</SheetSection>
	);
}
