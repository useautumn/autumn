import { Card, CardContent } from "@autumn/ui";
import type { PlanVariant } from "@/services/products/ProductService";
import { VariantItemChangeRow } from "./VariantItemChangeRow";
import { VariantPrice } from "./VariantPrice";

export function VariantPlanCard({ variant }: { variant: PlanVariant }) {
	const itemChanges = variant.item_changes ?? [];
	const created = itemChanges.filter((change) => change.action === "created");
	const deleted = itemChanges.filter((change) => change.action === "deleted");

	return (
		<Card className="w-[min(100%,20rem)] flex-none !rounded-2xl bg-background outline-4 outline-outer-background">
			<CardContent className="space-y-4 px-5 py-4">
				<div className="min-w-0">
					<div className="truncate text-base font-medium text-foreground">
						{variant.name}
					</div>
					<div className="truncate text-xs text-tertiary-foreground">
						{variant.id}
					</div>
				</div>

				<VariantPrice variant={variant} />

				{itemChanges.length > 0 && (
					<div className="space-y-2">
						{created.map((change) => (
							<VariantItemChangeRow
								key={`created-${change.feature_id}`}
								change={change}
							/>
						))}
						{deleted.map((change) => (
							<VariantItemChangeRow
								key={`deleted-${change.feature_id}`}
								change={change}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
