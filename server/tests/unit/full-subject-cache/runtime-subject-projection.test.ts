import { describe, expect, test } from "bun:test";
import { AppEnv, type NormalizedFullSubject } from "@autumn/shared";
import {
	buildRuntimeSubjectProjection,
	mergeRuntimeSubjectProjection,
} from "@/internal/customers/cache/fullSubject/runtimeSubject/runtimeSubjectModel.js";

const buildBalance = ({
	id,
	featureId,
	customerProductId,
}: {
	id: string;
	featureId: string;
	customerProductId: string;
}) =>
	({
		id,
		feature_id: featureId,
		internal_feature_id: `internal_${featureId}`,
		customer_product_id: customerProductId,
		entitlement_id: `entitlement_${featureId}`,
		entitlement: {
			id: `entitlement_${featureId}`,
			feature_id: featureId,
			internal_feature_id: `internal_${featureId}`,
			feature: { id: featureId },
		},
	}) as NormalizedFullSubject["customer_entitlements"][number];

const buildNormalized = (): NormalizedFullSubject =>
	({
		subjectType: "customer",
		customerId: "customer_1",
		internalCustomerId: "internal_customer_1",
		customer: {
			id: "customer_1",
			internal_id: "internal_customer_1",
			env: AppEnv.Sandbox,
			org_id: "org_1",
		},
		customer_products: [
			{
				id: "cp_messages",
				internal_product_id: "product_messages",
				subscription_ids: ["subscription_messages"],
			},
			{
				id: "cp_seats",
				internal_product_id: "product_seats",
				subscription_ids: ["subscription_seats"],
			},
		],
		customer_entitlements: [
			buildBalance({
				id: "balance_messages",
				featureId: "messages",
				customerProductId: "cp_messages",
			}),
			buildBalance({
				id: "balance_seats",
				featureId: "seats",
				customerProductId: "cp_seats",
			}),
		],
		customer_prices: [
			{
				id: "customer_price_messages",
				customer_product_id: "cp_messages",
				price_id: "price_messages",
			},
			{
				id: "customer_price_seats",
				customer_product_id: "cp_seats",
				price_id: "price_seats",
			},
		],
		customer_licenses: [],
		usage_windows: [],
		flags: {},
		products: [
			{ internal_id: "product_messages", id: "plan_messages" },
			{ internal_id: "product_seats", id: "plan_seats" },
		],
		entitlements: [
			{
				id: "entitlement_messages",
				feature_id: "messages",
				internal_feature_id: "internal_messages",
				feature: { id: "messages" },
			},
			{
				id: "entitlement_seats",
				feature_id: "seats",
				internal_feature_id: "internal_seats",
				feature: { id: "seats" },
			},
		],
		prices: [{ id: "price_messages" }, { id: "price_seats" }],
		free_trials: [],
		subscriptions: [
			{ id: "subscription_messages" },
			{ id: "subscription_seats" },
		],
		invoices: [{ id: "invoice_large" }],
		migration_item_runs: [{ id: "migration_large" }],
	}) as unknown as NormalizedFullSubject;

describe("runtime subject projection", () => {
	test("indexes only the static rows needed by each feature", () => {
		const projection = buildRuntimeSubjectProjection({
			normalized: buildNormalized(),
			subjectViewEpoch: 7,
			knownFeatureIds: ["messages", "seats", "unused"],
		});

		expect(projection.core.knownFeatureIds).toEqual([
			"messages",
			"seats",
			"unused",
		]);
		expect(projection.core.subjectViewEpoch).toBe(7);
		expect(projection.features.messages?.customer_products).toEqual([
			expect.objectContaining({ id: "cp_messages" }),
		]);
		expect(projection.features.messages?.customer_prices).toEqual([
			expect.objectContaining({ id: "customer_price_messages" }),
		]);
		expect(projection.features.messages?.subscriptions).toEqual([
			expect.objectContaining({ id: "subscription_messages" }),
		]);
		expect(projection.features.messages?.customerEntitlementIds).toEqual([
			"balance_messages",
		]);
		expect(projection.features.messages?.products).toEqual([
			expect.objectContaining({ internal_id: "product_messages" }),
		]);
		expect(projection.features.messages?.prices).toEqual([
			expect.objectContaining({ id: "price_messages" }),
		]);
		expect(projection.features.unused).toEqual(
			expect.objectContaining({
				featureId: "unused",
				customerEntitlementIds: [],
				customer_products: [],
			}),
		);
		expect(projection.features.messages).not.toHaveProperty("invoices");
		expect(projection.features.messages).not.toHaveProperty(
			"migration_item_runs",
		);
	});

	test("can backfill only requested feature fragments", () => {
		const projection = buildRuntimeSubjectProjection({
			normalized: buildNormalized(),
			subjectViewEpoch: 7,
			knownFeatureIds: ["messages", "seats"],
			projectedFeatureIds: ["messages"],
		});

		expect(projection.core.knownFeatureIds).toEqual(["messages", "seats"]);
		expect(Object.keys(projection.features)).toEqual(["messages"]);
	});

	test("merges requested feature fragments into one cached subject", () => {
		const projection = buildRuntimeSubjectProjection({
			normalized: buildNormalized(),
			subjectViewEpoch: 7,
			knownFeatureIds: ["messages", "seats"],
		});

		const merged = mergeRuntimeSubjectProjection({
			core: projection.core,
			features: [projection.features.messages, projection.features.seats],
		});

		expect(merged.customer_products.map(({ id }) => id)).toEqual([
			"cp_messages",
			"cp_seats",
		]);
		expect(merged.customerEntitlementIdsByFeatureId).toEqual({
			messages: ["balance_messages"],
			seats: ["balance_seats"],
		});
		expect(merged.invoices).toEqual([]);
		expect(merged.migration_item_runs).toEqual([]);
	});
});
