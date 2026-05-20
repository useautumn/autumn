import { AppEnv, FeatureType, type ModelMarkups } from "@autumn/shared";

/**
 * Create a feature fixture
 */
const create = ({
	id,
	internalId,
	name,
	type = FeatureType.Metered,
	config = {},
	modelMarkups = null,
}: {
	id: string;
	internalId?: string;
	name: string;
	type?: FeatureType;
	config?: Record<string, unknown>;
	modelMarkups?: ModelMarkups;
}) => ({
	internal_id: internalId ?? `internal_${id}`,
	org_id: "org_test",
	created_at: Date.now(),
	env: AppEnv.Sandbox,
	id,
	name,
	type,
	config,
	display: null,
	archived: false,
	event_names: [],
	model_markups: modelMarkups ?? null,
});

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const features = {
	create,
} as const;
