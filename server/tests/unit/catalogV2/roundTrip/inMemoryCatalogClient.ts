import {
	dbToApiFeatureV1,
	diffFeatureV1,
	type Feature,
	type FullProduct,
	featureV1ToDbFeature,
	PreviewUpdateCatalogParamsSchema,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange/fullProductToApiPlanV1Sync";
import { computeCatalogEntitlementPricesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeCatalogEntitlementPricesPlan/computeCatalogEntitlementPricesPlan";
import { computeFreeTrialPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeFreeTrialPlan/computeFreeTrialPlan";
import { computeProductDetailsPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeProductDetailsPlan/computeProductDetailsPlan";
import {
	type AutumnClient,
	createClient,
} from "../../../../../packages/atmn/src/generated/client";

/**
 * The real generated client, with `fetch` answered in-process: GET through
 * the production converters, preview through the production compute actions.
 * Every hint, rename and JSON round-trip is the CLI's own code, so what
 * `atmn pull` sees here is what it sees against a server.
 */

type Action = "create" | "update" | "delete" | "none";
type Catalog = { features: Feature[]; plans: FullProduct[] };
type PlanParams = NonNullable<
	ReturnType<typeof PreviewUpdateCatalogParamsSchema.parse>["plans"]
>[number];

const contextFor = ({
	features,
	multiCurrency = false,
}: {
	features: Feature[];
	multiCurrency?: boolean;
}) =>
	contexts.create({
		features,
		org: {
			id: "org_test",
			name: "Test Organization",
			slug: "test-org",
			default_currency: "usd",
			stripe_account_id: "acct_test",
			config: { multi_currency: multiCurrency },
		} as never,
	});

const featureAction = ({
	ctx,
	params,
	current,
}: {
	ctx: ReturnType<typeof contextFor>;
	params: Record<string, unknown>;
	current: Feature | undefined;
}): Action => {
	if (!current) return "create";
	const {
		feature_id,
		new_feature_id: _n,
		archived: _a,
		internal_id: _i,
		...create
	} = params as { feature_id: string } & Record<string, unknown>;
	const next = featureV1ToDbFeature({
		apiFeature: { id: feature_id, ...create } as never,
		originalFeature: current,
	});
	const { previous_attributes } = diffFeatureV1({
		from: dbToApiFeatureV1({ ctx, dbFeature: current }),
		to: dbToApiFeatureV1({ ctx, dbFeature: next }),
	});
	return previous_attributes ? "update" : "none";
};

const planAction = ({
	ctx,
	planParams,
	current,
}: {
	ctx: ReturnType<typeof contextFor>;
	planParams: PlanParams;
	current: FullProduct | undefined;
}): Action => {
	if (!current) return "create";
	const details = computeProductDetailsPlan({
		ctx,
		planParams,
		currentFullProduct: current,
		version: current.version,
		baseFullProduct: current,
		currentActive: current,
	});
	const freeTrial = computeFreeTrialPlan({
		freeTrialParams: planParams.free_trial,
		currentFreeTrial: current.free_trial ?? null,
		internalProductId: current.internal_id,
	});
	const entitlementPrices = computeCatalogEntitlementPricesPlan({
		ctx,
		product: details.product,
		baseFullProduct: current,
		planParams,
		versioning: "existing",
		protectReferencedRows: false,
	});
	return details.changed || freeTrial.changed || entitlementPrices
		? "update"
		: "none";
};

/** The server's JSON for each catalog route, over the in-memory catalog. */
const routes = ({
	catalog,
	multiCurrency,
}: {
	catalog: Catalog;
	multiCurrency: boolean;
}): Record<string, (body: unknown) => unknown> => {
	const ctx = contextFor({ features: catalog.features, multiCurrency });
	const featureById = new Map(catalog.features.map((f) => [f.id, f]));
	const planById = new Map(catalog.plans.map((p) => [p.id, p]));
	const diffCatalog = (body: unknown) => {
		const params = PreviewUpdateCatalogParamsSchema.parse(body);
		const statedFeatures = new Set(
			(params.features ?? []).map((row) => row.feature_id),
		);
		const statedPlans = new Set(
			(params.plans ?? []).map((row) => row.plan_id),
		);
		return {
			features: [
				...(params.features ?? []).map((row) => ({
					feature_id: row.feature_id,
					internal_id: featureById.get(row.feature_id)?.internal_id,
					action: featureAction({
						ctx,
						params: row as Record<string, unknown>,
						current: featureById.get(row.feature_id),
					}),
				})),
				...catalog.features
					.filter((feature) => !statedFeatures.has(feature.id))
					.map((feature) => ({
						feature_id: feature.id,
						internal_id: feature.internal_id,
						action: "delete",
					})),
			],
			plans: [
				...(params.plans ?? []).map((row) => {
					const current = planById.get(row.plan_id);
					return {
						plan_id: row.plan_id,
						internal_id: current?.internal_id,
						version_slug: current?.version_slug ?? "v1",
						version: current?.version ?? 1,
						action: planAction({ ctx, planParams: row, current }),
					};
				}),
				...catalog.plans
					.filter((plan) => !statedPlans.has(plan.id))
					.map((plan) => ({
						plan_id: plan.id,
						internal_id: plan.internal_id,
						version_slug: plan.version_slug ?? "v1",
						version: plan.version,
						action: "delete",
					})),
			],
		};
	};

	return {
		"/v1/catalogV2.get": () => ({
			features: catalog.features.map((dbFeature) =>
				dbToApiFeatureV1({ ctx, dbFeature }),
			),
			plans: catalog.plans.map((product) =>
				fullProductToApiPlanV1Sync({ product, features: catalog.features }),
			),
		}),
		"/v1/catalogV2.diff": diffCatalog,
		"/v1/catalogV2.preview_update": diffCatalog,
		"/v1/organization.preview_update": () => ({ config: { changes: [] } }),
		"/v1/organization.update": () => ({}),
		"/v1/catalogV2.update": () => {
			throw new Error("convergence tests never apply");
		},
	};
};

export const inMemoryCatalogClient = ({
	catalog,
	multiCurrency = false,
}: {
	catalog: Catalog;
	multiCurrency?: boolean;
}): AutumnClient => {
	const handlers = routes({ catalog, multiCurrency });
	// Bun's fetch type carries `preconnect`; the client only calls it.
	const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const path = new URL(String(input)).pathname;
		const handler = handlers[path];
		if (!handler) throw new Error(`no in-memory route for ${path}`);
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		return Response.json(handler(body));
	}) as unknown as typeof globalThis.fetch;
	return createClient({
		baseUrl: "http://in-memory",
		secretKey: "test",
		fetch,
	});
};
