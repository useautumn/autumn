import { AppEnv, FeatureType } from "@autumn/shared";

/**
 * Create a feature fixture
 */
const create = ({
	id,
	internalId,
	name,
	type = FeatureType.Metered,
}: {
	id: string;
	internalId?: string;
	name: string;
	type?: FeatureType;
}) => ({
	internal_id: internalId ?? `internal_${id}`,
	org_id: "org_test",
	created_at: Date.now(),
	env: AppEnv.Sandbox,
	id,
	name,
	type,
	config: {},
	display: null,
	archived: false,
	event_names: [],
});

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const features = {
	create,
} as const;
