import { type ApiFeatureV1, FeatureType } from "@autumn/shared";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";
import { CreditSchemaSheet, type ResolveFeature } from "./CreditSchemaSheet";

export const isCreditSystem = (feature: ApiFeatureV1): boolean =>
	(feature.type === FeatureType.CreditSystem ||
		feature.type === FeatureType.AiCreditSystem) &&
	(feature.credit_schema?.length ?? 0) > 0;

/** A credit-system feature row — click to open its schema in a sheet. */
export function CreditSystemRow({
	feature,
	resolveFeature,
}: {
	feature: ApiFeatureV1;
	resolveFeature: ResolveFeature;
}) {
	const [open, setOpen] = useState(false);
	const config = getFeatureIconConfig(feature.type);

	return (
		<>
			<button
				className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-secondary/40"
				onClick={() => setOpen(true)}
				type="button"
			>
				<span className={config.color} title={config.label}>
					{config.icon}
				</span>
				<span className="font-medium text-foreground text-sm">
					{feature.name}
				</span>
				<span className="font-mono text-tertiary-foreground text-xs">
					{feature.id}
				</span>
				<span className="ml-auto flex items-center gap-1 text-tertiary-foreground text-xs">
					{config.label}
					<CaretRightIcon size={12} />
				</span>
			</button>
			<CreditSchemaSheet
				feature={feature}
				onOpenChange={setOpen}
				open={open}
				resolveFeature={resolveFeature}
			/>
		</>
	);
}
