import {
	dbToApiFeatureV1,
	diffFeatureV1,
	type Feature,
	type FullProduct,
	featureV1ToDbFeature,
	PreviewUpdateCatalogParamsSchema,
	type Price,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange/fullProductToApiPlanV1Sync";
import { computeCatalogEntitlementPricesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeCatalogEntitlementPricesPlan/computeCatalogEntitlementPricesPlan";
import { computeFreeTrialPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeFreeTrialPlan/computeFreeTrialPlan";
import { computeProductDetailsPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeProductDetailsPlan/computeProductDetailsPlan";
import type { EntitlementPricesPlan } from "@/internal/products/actions/computeEntitlementPricesPlan/types/entitlementPricesPlan";
// The CLI's own emit → parse path, so the test sees exactly what `atmn pull`
// writes and what `atmn push` sends back. Relative because the package only
// publishes its bin (same reason the atmn integration tests import this way).
import { COLLECTIONS } from "../../../../../packages/atmn-nightly/src/generated/emit";
import { emitFixture } from "../../../../../packages/atmn-nightly/src/generated/emitRuntime";
import { feature as featureBuilder } from "../../../../../packages/atmn-nightly/src/generated/features";
import { plan as planBuilder } from "../../../../../packages/atmn-nightly/src/generated/plans";
import {
	atmn,
	hintsOf,
	splitWire,
	toFixture,
} from "../../../../../packages/atmn-nightly/src/generated/wire";
import {
	describeEntitlementDifferences,
	describePriceDifferences,
	type RowDifference,
} from "./describeRowDifferences";

/**
 * The invariant `atmn pull` relies on: a catalog row, emitted as a fixture and
 * pushed back through preview_update, must be a no-op. Each facet is checked
 * through the same converters and comparators the real handler uses, no DB.
 */

const WIRE_HINTS = hintsOf({
	recordPaths: [],
	frozenPaths: [],
	renamedPaths: {},
});

/** Org flags a row can depend on; a case states the ones it needs. */
export type RoundTripOrg = { multiCurrency?: boolean };

const contextFor = (features: Feature[], org: RoundTripOrg = {}) =>
	contexts.create({
		features,
		org: {
			id: "org_test",
			name: "Test Organization",
			slug: "test-org",
			default_currency: "usd",
			stripe_account_id: "acct_test",
			config: { multi_currency: org.multiCurrency ?? false },
		} as never,
	});

/** GET response row (snake) → fixture text → evaluated fixture object. */
const emitAndEvaluate = ({
	collection,
	builder,
	row,
	featureTypes,
}: {
	collection: "features" | "plans";
	builder: typeof featureBuilder | typeof planBuilder;
	row: Record<string, unknown>;
	featureTypes: Record<string, string>;
}) => {
	const spec = COLLECTIONS[collection];
	if (!spec) throw new Error(`no spec for ${collection}`);
	const fixtureRow = toFixture({ value: row, path: "", hints: WIRE_HINTS });
	const text = emitFixture({
		spec,
		row: fixtureRow as Record<string, unknown>,
		includeMappings: false,
		indent: "",
		context: { featureTypes },
	});
	// The emitted text is `plan({ active: true, ... })` / `feature({ ... })`; evaluate it with
	// the same identity builder the config file would import.
	const evaluate = new Function(spec.builder, `return ${text};`);
	return { text, fixture: evaluate(builder) as Record<string, unknown> };
};

const featureTypesOf = (features: Feature[]) =>
	Object.fromEntries(features.map((feature) => [feature.id, feature.type]));

/**
 * What `atmn push` sends for a plan that `atmn pull` just wrote: the GET row,
 * emitted as fixture text, evaluated, and lowered to the wire again.
 */
export const pulledPlanToWire = ({
	plan,
	featureTypes,
}: {
	plan: Record<string, unknown>;
	featureTypes: Record<string, string>;
}): Record<string, unknown> => {
	const { fixture } = emitAndEvaluate({
		collection: "plans",
		builder: planBuilder,
		row: plan,
		featureTypes,
	});
	const { catalog } = splitWire(atmn({ plans: [fixture] } as never));
	const [wirePlan] = (catalog.plans ?? []) as Record<string, unknown>[];
	if (!wirePlan) throw new Error("plan missing from wire");
	return wirePlan;
};

export type FeatureFinding = {
	featureId: string;
	fixture: string;
	previousAttributes: unknown;
};

export const roundTripFeature = ({
	feature,
}: {
	feature: Feature;
}): FeatureFinding | null => {
	const ctx = contextFor([feature]);
	const emitted = dbToApiFeatureV1({ ctx, dbFeature: feature });
	const { text, fixture } = emitAndEvaluate({
		collection: "features",
		builder: featureBuilder,
		row: emitted as unknown as Record<string, unknown>,
		featureTypes: featureTypesOf([feature]),
	});
	const { catalog } = splitWire(atmn({ features: [fixture] } as never));
	const { features } = PreviewUpdateCatalogParamsSchema.parse(catalog);
	const [params] = features ?? [];
	if (!params) throw new Error("feature params missing");

	const {
		new_feature_id: _n,
		archived: _a,
		internal_id: _i,
		...create
	} = params;
	const next = featureV1ToDbFeature({
		apiFeature: { id: params.feature_id, ...create },
		originalFeature: feature,
	});
	const { previous_attributes } = diffFeatureV1({
		from: dbToApiFeatureV1({ ctx, dbFeature: feature }),
		to: dbToApiFeatureV1({ ctx, dbFeature: next }),
	});
	return previous_attributes
		? {
				featureId: feature.id,
				fixture: text,
				previousAttributes: previous_attributes,
			}
		: null;
};

export type PlanFinding = {
	planId: string;
	fixture: string;
	detailsChanged: boolean;
	previousAttributes: unknown;
	freeTrialChanged: boolean;
	/** `entitlement:<feature>` / `price:<feature|base>` → the fields that differ. */
	differences: Record<string, RowDifference[]>;
	entitlements: { new: string[]; retired: string[]; deleted: string[] };
	prices: { new: number; retired: number; deleted: number };
};

const priceKey = (price: Price) => `price:${price.config.feature_id ?? "base"}`;

/**
 * A retired row and the new row that replaces it are the same feature (or
 * both the base price); pairing them names exactly which field the comparator
 * refused, instead of only counting how many rows moved.
 */
const pairedDifferences = ({
	plan,
}: {
	plan: EntitlementPricesPlan;
}): Record<string, RowDifference[]> => {
	const out: Record<string, RowDifference[]> = {};
	for (const stored of plan.entitlements.retired) {
		const desired = plan.entitlements.new.find(
			(row) => row.internal_feature_id === stored.internal_feature_id,
		);
		const key = `entitlement:${stored.feature_id}`;
		out[key] = desired
			? describeEntitlementDifferences({ stored, desired })
			: [{ path: "(row)", stored: "present", desired: "missing" }];
	}
	for (const stored of plan.prices.retired) {
		const desired = plan.prices.new.find(
			(row) => priceKey(row) === priceKey(stored),
		);
		out[priceKey(stored)] = desired
			? describePriceDifferences({ stored, desired })
			: [{ path: "(row)", stored: "present", desired: "missing" }];
	}
	for (const desired of plan.entitlements.new) {
		const key = `entitlement:${desired.feature_id}`;
		if (!(key in out))
			out[key] = [{ path: "(row)", stored: "missing", desired: "present" }];
	}
	for (const desired of plan.prices.new) {
		if (!(priceKey(desired) in out))
			out[priceKey(desired)] = [
				{ path: "(row)", stored: "missing", desired: "present" },
			];
	}
	return out;
};

export const roundTripPlan = ({
	product,
	features,
	org,
}: {
	product: FullProduct;
	features: Feature[];
	org?: RoundTripOrg;
}): PlanFinding | null => {
	const ctx = contextFor(features, org);
	const emitted = fullProductToApiPlanV1Sync({ product, features });
	const { text, fixture } = emitAndEvaluate({
		collection: "plans",
		builder: planBuilder,
		row: emitted as unknown as Record<string, unknown>,
		featureTypes: featureTypesOf(features),
	});
	const { catalog } = splitWire(atmn({ plans: [fixture] } as never));
	const { plans } = PreviewUpdateCatalogParamsSchema.parse(catalog);
	const [planParams] = plans ?? [];
	if (!planParams) throw new Error("plan params missing");

	const details = computeProductDetailsPlan({
		ctx,
		planParams,
		currentFullProduct: product,
		version: product.version,
		baseFullProduct: product,
		currentActive: product,
	});
	const freeTrial = computeFreeTrialPlan({
		freeTrialParams: planParams.free_trial,
		currentFreeTrial: product.free_trial ?? null,
		internalProductId: product.internal_id,
	});
	const entitlementPrices = computeCatalogEntitlementPricesPlan({
		ctx,
		product: details.product,
		baseFullProduct: product,
		planParams,
		versioning: "existing",
		protectReferencedRows: false,
	});

	const featureIds = (rows: { feature_id?: string | null }[]) =>
		rows.map((row) => row.feature_id ?? "?");
	const isNoop =
		!details.changed && !freeTrial.changed && entitlementPrices === undefined;
	if (isNoop) return null;
	return {
		planId: product.id,
		fixture: text,
		detailsChanged: details.changed,
		previousAttributes: details.previousAttributes ?? null,
		freeTrialChanged: freeTrial.changed,
		differences: entitlementPrices
			? pairedDifferences({ plan: entitlementPrices })
			: {},
		entitlements: {
			new: featureIds(entitlementPrices?.entitlements.new ?? []),
			retired: featureIds(entitlementPrices?.entitlements.retired ?? []),
			deleted: featureIds(entitlementPrices?.entitlements.deleted ?? []),
		},
		prices: {
			new: entitlementPrices?.prices.new.length ?? 0,
			retired: entitlementPrices?.prices.retired.length ?? 0,
			deleted: entitlementPrices?.prices.deleted.length ?? 0,
		},
	};
};
