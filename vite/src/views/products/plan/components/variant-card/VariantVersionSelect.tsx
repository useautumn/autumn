import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@autumn/ui";
import { cn } from "@/lib/utils";
import type { PlanVariant } from "@/services/products/ProductService";
import { ActiveVersionDot } from "../PlanVersionOption";
import { VersionSlugBadge } from "../VersionSlugBadge";
import { versionLabel } from "../versionLabel";
import { variantRowVersion } from "./variantRowVersion";

export function VariantVersionSelect({
	rows,
	selectedVersion,
	onVersionChange,
}: {
	rows: PlanVariant[];
	selectedVersion: number;
	onVersionChange: (version: number) => void;
}) {
	const selected =
		rows.find((row) => variantRowVersion(row) === selectedVersion) ?? rows[0];
	const selectedLabel = versionLabel({
		versionSlug: selected.product?.version_slug,
		version: variantRowVersion(selected),
	});

	if (rows.length === 1) {
		return <VersionSlugBadge slug={selectedLabel} />;
	}

	const items = Object.fromEntries(
		rows.map((row) => {
			const version = variantRowVersion(row);
			return [
				String(version),
				versionLabel({
					versionSlug: row.product?.version_slug,
					version,
				}),
			];
		}),
	);

	return (
		<Select
			items={items}
			onValueChange={(value) => onVersionChange(Number(value))}
			value={String(variantRowVersion(selected))}
		>
			<SelectTrigger className="w-fit !h-6" size="sm">
				<span className="flex min-w-0 items-center gap-1.5">
					{selected.product?.active ? <ActiveVersionDot active /> : null}
					<span className="tabular-nums">{selectedLabel}</span>
				</span>
			</SelectTrigger>
			<SelectContent className="min-w-28">
				{rows.map((row) => {
					const version = variantRowVersion(row);
					const label = versionLabel({
						versionSlug: row.product?.version_slug,
						version,
					});
					const isSelected = version === variantRowVersion(selected);
					return (
						<SelectItem
							className={cn("*:last:w-full", isSelected && "bg-accent/70")}
							indicator={false}
							key={version}
							value={String(version)}
						>
							<span className="flex items-center gap-2">
								<ActiveVersionDot active={Boolean(row.product?.active)} />
								<span
									className={cn(
										"tabular-nums",
										isSelected
											? "font-medium text-foreground"
											: "text-muted-foreground",
									)}
								>
									{label}
								</span>
							</span>
						</SelectItem>
					);
				})}
			</SelectContent>
		</Select>
	);
}
