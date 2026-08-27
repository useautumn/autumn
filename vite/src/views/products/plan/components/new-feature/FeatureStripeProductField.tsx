import { FormLabel, IconTooltipButton } from "@autumn/ui";
import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { useStripeProductsResolveQuery } from "@/hooks/queries/useStripeProductsResolveQuery";
import { StripeProductSelect } from "@/views/developer/configure-stripe/mappings/StripeProductSelect";
import { useStripeProductLink } from "@/views/developer/configure-stripe/mappings/useStripeProductLink";
import { useStripeProductSearch } from "@/views/developer/configure-stripe/mappings/useStripeProductSearch";

export function FeatureStripeProductField({
	stripeProductId,
	onChange,
}: {
	stripeProductId: string | null;
	onChange: (stripeProductId: string | null) => void;
}) {
	const { stripeProducts } = useStripeProductsResolveQuery({
		stripeProductIds: stripeProductId ? [stripeProductId] : [],
	});
	const { setSearch, knownStripeProducts, selectStripeProducts, isSearching } =
		useStripeProductSearch({
			knownProducts: stripeProducts,
			enabled: true,
		});
	const getStripeProductHref = useStripeProductLink();

	return (
		<div className="flex flex-col w-full gap-1">
			<FormLabel>Stripe Product (optional)</FormLabel>
			<div className="flex items-center gap-2">
				<div className="min-w-0 flex-1">
					<StripeProductSelect
						isLoading={isSearching}
						knownProducts={knownStripeProducts}
						onChange={onChange}
						onSearchChange={setSearch}
						products={selectStripeProducts}
						value={stripeProductId}
					/>
				</div>
				{stripeProductId && (
					<IconTooltipButton
						icon={<StripeIcon size={14} />}
						onClick={() =>
							window.open(
								getStripeProductHref(stripeProductId),
								"_blank",
								"noopener,noreferrer",
							)
						}
						tooltip="Open in Stripe"
					/>
				)}
			</div>
			<span className="text-tiny text-tertiary-foreground">
				Usage prices for this feature bill under this Stripe product. Leave
				empty to let Autumn create one.
			</span>
		</div>
	);
}
