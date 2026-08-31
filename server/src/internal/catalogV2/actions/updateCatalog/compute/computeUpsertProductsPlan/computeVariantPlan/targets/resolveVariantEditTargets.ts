import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { declaredVariantTargets } from "./declaredVariantTargets";
import { propagatedVariantTargets } from "./propagatedVariantTargets";
import { settingsFollowerTargets } from "./settingsFollowerTargets";
import type { VariantEditTarget } from "./variantEditTarget";

const mergeVariantTargets = ({
	targets,
}: {
	targets: VariantEditTarget[];
}): VariantEditTarget[] => {
	const byInternalId = new Map<string, VariantEditTarget>();
	for (const target of targets) {
		const merged = byInternalId.get(target.row.internal_id);
		if (!merged) {
			byInternalId.set(target.row.internal_id, { ...target });
			continue;
		}
		merged.follow ||= target.follow;
		merged.declared ||= target.declared;
		merged.unlink ||= target.unlink;
		if (target.customize !== undefined) merged.customize = target.customize;
		if (target.archived !== undefined) merged.archived = target.archived;
		merged.newVersionSlug ??= target.newVersionSlug;
	}
	return [...byInternalId.values()];
};

/** Every existing variant row this base upsert touches, one merged target per row. */
export const resolveVariantEditTargets = ({
	upsert,
	productStatesContext,
	includeSettingsTargets,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
	includeSettingsTargets: boolean;
}): VariantEditTarget[] =>
	mergeVariantTargets({
		targets: [
			...propagatedVariantTargets({ upsert, productStatesContext }),
			...declaredVariantTargets({ upsert, productStatesContext }),
			...(includeSettingsTargets
				? settingsFollowerTargets({ upsert, productStatesContext })
				: []),
		],
	});
