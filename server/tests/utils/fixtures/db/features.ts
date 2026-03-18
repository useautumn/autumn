import { AppEnv, FeatureType } from "@autumn/shared";

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
	isAiCreditSystem = false,
}: {
	id: string;
	internalId?: string;
	name: string;
	type?: FeatureType;
	config?: Record<string, unknown>;
	modelMarkups?: Record<
		string,
		{ markup: number; input_cost?: number; output_cost?: number, humanModelName: string }
	> | null;
	isAiCreditSystem?: boolean;
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
	is_ai_credit_system: isAiCreditSystem ?? false,
});

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const features = {
	create,
} as const;
