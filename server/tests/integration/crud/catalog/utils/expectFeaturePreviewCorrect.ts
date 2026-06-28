import { expect } from "bun:test";
import type { CatalogPreviewUpdateResponse, FeatureType } from "@autumn/shared";

type FeatureChangeAction = "create" | "update" | "remove" | "none";
type FeatureChangeReason =
	| "has_customers"
	| "used_in_products"
	| "used_in_credit_system"
	| "has_usage_price"
	| "id_already_exists"
	| "credit_system_type_change"
	| "unsupported_dependency"
	| null;

/**
 * Assert the per-feature slice of a catalog.preview_update response. Only the
 * fields you pass are checked. `blockerCodes` is a contains-check (extra
 * blockers from shared-org usage are tolerated); `noBlockers` is exact-empty.
 */
export const expectFeaturePreviewCorrect = ({
	preview,
	featureId,
	type,
	action,
	willArchive,
	blocked,
	blockedReason,
	featureExpanded,
	expandedFeatureIsNull,
	previousAttributes,
	noBlockers,
	blockerCodes,
}: {
	preview: CatalogPreviewUpdateResponse;
	featureId: string;
	type?: FeatureType;
	action?: FeatureChangeAction;
	willArchive?: boolean;
	blocked?: boolean;
	blockedReason?: FeatureChangeReason;
	featureExpanded?: boolean;
	expandedFeatureIsNull?: boolean;
	previousAttributes?: Record<string, unknown> | null;
	noBlockers?: boolean;
	blockerCodes?: string[];
}) => {
	const result = preview.feature_changes.find((feature: any) => {
		return feature.feature_id === featureId || feature.feature?.id === featureId;
	});
	expect(result, `No feature preview for ${featureId}`).toBeDefined();
	const featureChanges = result as any;
	expect(
		featureChanges,
		`feature_changes missing for ${featureId}: ${JSON.stringify(result)}`,
	).toBeDefined();

	if (typeof type !== "undefined") {
		expect(
			featureChanges.feature?.type,
			`expanded feature type for ${featureId}`,
		).toBe(type);
	}

	if (typeof action !== "undefined") {
		expect(featureChanges.action, `action for ${featureId}`).toBe(action);
	}

	if (typeof willArchive !== "undefined") {
		expect(featureChanges.will_archive, `will_archive for ${featureId}`).toBe(
			willArchive,
		);
	}

	if (typeof blocked !== "undefined") {
		expect(featureChanges.blocked, `blocked for ${featureId}`).toBe(blocked);
	}

	if (typeof blockedReason !== "undefined") {
		expect(featureChanges.blocked_reason, `blocked_reason for ${featureId}`).toBe(
			blockedReason,
		);
	}

	if (typeof featureExpanded !== "undefined") {
		expect(
			Object.prototype.hasOwnProperty.call(featureChanges, "feature"),
			`feature expanded for ${featureId}`,
		).toBe(featureExpanded);
	}

	if (noBlockers) {
		expect(featureChanges.will_archive, `will_archive for ${featureId}`).toBe(
			false,
		);
		expect(featureChanges.blocked, `blocked for ${featureId}`).toBe(false);
		expect(featureChanges.blocked_reason, `blocked_reason for ${featureId}`).toBe(
			null,
		);
	}

	if (blockerCodes) {
		const reasonByLegacyCode: Record<string, FeatureChangeReason> = {
			attached_to_customer: "has_customers",
			has_usage_price: "has_usage_price",
			used_in_credit_system: "used_in_credit_system",
			used_in_product_credit_system: "used_in_products",
			id_already_exists: "id_already_exists",
			type_switch_credit_system: "credit_system_type_change",
		};
		const reasons = blockerCodes.map((code) => reasonByLegacyCode[code]);
		expect(reasons, `legacy blocker mapping for ${featureId}`).toContain(
			featureChanges.blocked_reason,
		);
		expect(featureChanges.will_archive, `will_archive for ${featureId}`).toBe(
			false,
		);
		expect(featureChanges.blocked, `blocked for ${featureId}`).toBe(true);
	}

	if (expandedFeatureIsNull) {
		expect(featureChanges.feature, `expanded feature for ${featureId}`).toBe(
			null,
		);
	}

	if (typeof previousAttributes !== "undefined") {
		if (previousAttributes === null) {
			expect(featureChanges.previous_attributes).toBe(null);
			return featureChanges;
		}
		expect(
			featureChanges.previous_attributes,
			`previous_attributes for ${featureId}`,
		).toMatchObject(previousAttributes);
	}

	return featureChanges;
};
