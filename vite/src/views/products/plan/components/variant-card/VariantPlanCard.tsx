import { Card, CardContent, CopyButton } from "@autumn/ui";
import { useState } from "react";
import { ItemChangeList } from "@/components/v2/ItemChangeList";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import type { PlanVariant } from "@/services/products/ProductService";
import { LicenseChangeList } from "../../versioning/LicenseChangeList";
import { VariantPlanLink } from "./VariantPlanLink";
import { VariantPrice } from "./VariantPrice";
import { VariantVersionSelect } from "./VariantVersionSelect";
import { variantRowVersion } from "./variantRowVersion";

const ID_CHIP_INNER_CLASS = "max-w-40 text-tiny-id truncate !font-normal";

export function VariantPlanCard({ rows }: { rows: PlanVariant[] }) {
	const newest = rows[0];
	const [pickedVersion, setPickedVersion] = useState(variantRowVersion(newest));
	const selected =
		rows.find((row) => variantRowVersion(row) === pickedVersion) ?? newest;
	const selectedVersion = variantRowVersion(selected);
	const { features } = useFeaturesQuery();

	return (
		<Card className="min-w-sm max-w-xl mx-4 w-full !rounded-2xl bg-background">
			<CardContent className="flex flex-col gap-4 px-5">
				<div className="flex items-center justify-between gap-2">
					<div className="flex min-w-0 items-center gap-2">
						<div className="truncate text-base font-medium text-foreground">
							{selected.name}
						</div>
						<VariantVersionSelect
							onVersionChange={setPickedVersion}
							rows={rows}
							selectedVersion={selectedVersion}
						/>
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<CopyButton
							className="text-tertiary-foreground"
							innerClassName={ID_CHIP_INNER_CLASS}
							size="mini"
							text={selected.id}
						/>
						<VariantPlanLink
							name={selected.name}
							planId={selected.id}
							version={selectedVersion}
						/>
					</div>
				</div>

				<VariantPrice variant={selected} />

				<ItemChangeList itemChanges={selected.item_changes ?? []} />
				<LicenseChangeList
					changes={selected.license_changes ?? []}
					features={features}
				/>
			</CardContent>
		</Card>
	);
}
