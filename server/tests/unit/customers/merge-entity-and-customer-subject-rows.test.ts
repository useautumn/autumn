import { describe, expect, test } from "bun:test";
import type {
	DbCustomerEntitlement,
	DbCustomerPrice,
	DbCustomerProduct,
	SubjectQueryRow,
} from "@autumn/shared";
import {
	CUSTOMER_PRODUCT_LIMIT,
	EXTRA_CUSTOMER_ENTITLEMENT_LIMIT,
} from "@/internal/customers/repos/getFullSubject/getFullSubjectRowsQuery.js";
import { mergeEntityAndCustomerSubjectRows } from "@/internal/customers/repos/getFullSubject/mergeEntityAndCustomerSubjectRows.js";

const createCustomerProduct = ({
	id,
	internalProductId = `prod_internal_${id}`,
	internalCustomerId = "cus_internal_1",
	freeTrialId = null,
	subscriptionIds = [],
}: {
	id: string;
	internalProductId?: string;
	internalCustomerId?: string;
	freeTrialId?: string | null;
	subscriptionIds?: string[];
}) =>
	({
		id,
		internal_product_id: internalProductId,
		internal_customer_id: internalCustomerId,
		free_trial_id: freeTrialId,
		subscription_ids: subscriptionIds,
	}) as DbCustomerProduct;

const createCustomerEntitlement = ({
	id,
	customerProductId,
	entitlementId = `ent_${id}`,
}: {
	id: string;
	customerProductId: string | null;
	entitlementId?: string;
}) =>
	({
		id,
		customer_product_id: customerProductId,
		entitlement_id: entitlementId,
	}) as DbCustomerEntitlement;

const createCustomerPrice = ({
	id,
	customerProductId,
	priceId = `price_${id}`,
}: {
	id: string;
	customerProductId: string | null;
	priceId?: string;
}) =>
	({
		id,
		customer_product_id: customerProductId,
		price_id: priceId,
	}) as DbCustomerPrice;

const createRow = (overrides: Partial<SubjectQueryRow> = {}): SubjectQueryRow =>
	({
		customer: { internal_id: "cus_internal_1" },
		customer_products: [],
		customer_entitlements: [],
		customer_prices: [],
		extra_customer_entitlements: [],
		replaceables: [],
		rollovers: [],
		products: [],
		entitlements: [],
		prices: [],
		free_trials: [],
		subscriptions: [],
		...overrides,
	}) as SubjectQueryRow;

describe("mergeEntityAndCustomerSubjectRows", () => {
	test("returns entity row unchanged when customer row is missing", () => {
		const entityRow = createRow({
			customer_products: [createCustomerProduct({ id: "cp_entity_1" })],
		});

		const merged = mergeEntityAndCustomerSubjectRows({
			entityRow,
			customerRow: undefined,
		});

		expect(merged).toBe(entityRow);
	});

	test("drops entity-scoped products belonging to a different customer", () => {
		const entityRow = createRow({
			customer_products: [
				createCustomerProduct({ id: "cp_ours" }),
				createCustomerProduct({
					id: "cp_other_customer",
					internalCustomerId: "cus_internal_other",
				}),
			],
		});
		const customerRow = createRow();

		const merged = mergeEntityAndCustomerSubjectRows({
			entityRow,
			customerRow,
		});

		expect(merged.customer_products.map((product) => product.id)).toEqual([
			"cp_ours",
		]);
	});

	test("orders entity-scoped rows before customer-level rows", () => {
		const entityRow = createRow({
			customer_products: [
				createCustomerProduct({ id: "cp_entity_1" }),
				createCustomerProduct({ id: "cp_entity_2" }),
			],
			extra_customer_entitlements: [
				createCustomerEntitlement({
					id: "ce_extra_entity",
					customerProductId: null,
				}),
			],
		});
		const customerRow = createRow({
			customer_products: [createCustomerProduct({ id: "cp_customer_1" })],
			extra_customer_entitlements: [
				createCustomerEntitlement({
					id: "ce_extra_customer",
					customerProductId: null,
				}),
			],
		});

		const merged = mergeEntityAndCustomerSubjectRows({
			entityRow,
			customerRow,
		});

		expect(merged.customer_products.map((product) => product.id)).toEqual([
			"cp_entity_1",
			"cp_entity_2",
			"cp_customer_1",
		]);
		expect(
			merged.extra_customer_entitlements.map((entitlement) => entitlement.id),
		).toEqual(["ce_extra_entity", "ce_extra_customer"]);
	});

	test("keeps customer fields from the entity row", () => {
		const entityRow = createRow({
			entity: { internal_id: "entity_internal_1" } as SubjectQueryRow["entity"],
		});
		const customerRow = createRow();

		const merged = mergeEntityAndCustomerSubjectRows({
			entityRow,
			customerRow,
		});

		expect(merged.customer).toBe(entityRow.customer);
		expect(merged.entity).toBe(entityRow.entity);
		expect(merged.invoices).toBeUndefined();
		expect(merged.entity_aggregations).toBeUndefined();
	});

	test("cap truncation drops customer-level products and all their dependent rows", () => {
		const entityProducts = Array.from(
			{ length: CUSTOMER_PRODUCT_LIMIT - 1 },
			(_, index) => createCustomerProduct({ id: `cp_entity_${index}` }),
		);
		const keptProduct = createCustomerProduct({
			id: "cp_customer_kept",
			freeTrialId: "ft_kept",
			subscriptionIds: ["sub_kept"],
		});
		const droppedProduct = createCustomerProduct({
			id: "cp_customer_dropped",
			freeTrialId: "ft_dropped",
			subscriptionIds: ["sub_dropped"],
		});

		const entityRow = createRow({ customer_products: entityProducts });
		const customerRow = createRow({
			customer_products: [keptProduct, droppedProduct],
			customer_entitlements: [
				createCustomerEntitlement({
					id: "ce_kept",
					customerProductId: keptProduct.id,
					entitlementId: "ent_kept",
				}),
				createCustomerEntitlement({
					id: "ce_dropped",
					customerProductId: droppedProduct.id,
					entitlementId: "ent_dropped",
				}),
			],
			customer_prices: [
				createCustomerPrice({
					id: "cpr_kept",
					customerProductId: keptProduct.id,
					priceId: "price_kept",
				}),
				createCustomerPrice({
					id: "cpr_dropped",
					customerProductId: droppedProduct.id,
					priceId: "price_dropped",
				}),
			],
			rollovers: [
				{ id: "ro_kept", cus_ent_id: "ce_kept" },
				{ id: "ro_dropped", cus_ent_id: "ce_dropped" },
			] as SubjectQueryRow["rollovers"],
			replaceables: [
				{ id: "rep_kept", cus_ent_id: "ce_kept" },
				{ id: "rep_dropped", cus_ent_id: "ce_dropped" },
			] as SubjectQueryRow["replaceables"],
			products: [
				{ internal_id: keptProduct.internal_product_id },
				{ internal_id: droppedProduct.internal_product_id },
			] as SubjectQueryRow["products"],
			entitlements: [
				{ id: "ent_kept" },
				{ id: "ent_dropped" },
			] as SubjectQueryRow["entitlements"],
			prices: [
				{ id: "price_kept" },
				{ id: "price_dropped" },
			] as SubjectQueryRow["prices"],
			free_trials: [
				{ id: "ft_kept" },
				{ id: "ft_dropped" },
			] as SubjectQueryRow["free_trials"],
			subscriptions: [
				{ stripe_id: "sub_kept" },
				{ stripe_id: "sub_dropped" },
			] as SubjectQueryRow["subscriptions"],
		});

		const merged = mergeEntityAndCustomerSubjectRows({
			entityRow,
			customerRow,
		});

		expect(merged.customer_products).toHaveLength(CUSTOMER_PRODUCT_LIMIT);
		expect(
			merged.customer_products[merged.customer_products.length - 1]?.id,
		).toBe(keptProduct.id);
		expect(merged.customer_entitlements.map((row) => row.id)).toEqual([
			"ce_kept",
		]);
		expect(merged.customer_prices.map((row) => row.id)).toEqual(["cpr_kept"]);
		expect(merged.rollovers.map((row) => row.id)).toEqual(["ro_kept"]);
		expect(merged.replaceables.map((row) => row.id)).toEqual(["rep_kept"]);
		expect(merged.products.map((row) => row.internal_id)).toContain(
			keptProduct.internal_product_id,
		);
		expect(merged.products.map((row) => row.internal_id)).not.toContain(
			droppedProduct.internal_product_id,
		);
		expect(merged.entitlements.map((row) => row.id)).toEqual(["ent_kept"]);
		expect(merged.prices.map((row) => row.id)).toEqual(["price_kept"]);
		expect(merged.free_trials.map((row) => row.id)).toEqual(["ft_kept"]);
		expect(merged.subscriptions.map((row) => row.stripe_id)).toEqual([
			"sub_kept",
		]);
	});

	test("extras cap truncation drops the dropped extras' rollovers and entitlement refs", () => {
		const entityExtras = Array.from(
			{ length: EXTRA_CUSTOMER_ENTITLEMENT_LIMIT },
			(_, index) =>
				createCustomerEntitlement({
					id: `ce_extra_entity_${index}`,
					customerProductId: null,
					entitlementId: `ent_extra_entity_${index}`,
				}),
		);
		const droppedExtra = createCustomerEntitlement({
			id: "ce_extra_customer_dropped",
			customerProductId: null,
			entitlementId: "ent_extra_dropped",
		});

		const entityRow = createRow({
			extra_customer_entitlements: entityExtras,
			entitlements: entityExtras.map(
				(extra) =>
					({
						id: extra.entitlement_id,
					}) as SubjectQueryRow["entitlements"][number],
			),
		});
		const customerRow = createRow({
			extra_customer_entitlements: [droppedExtra],
			rollovers: [
				{ id: "ro_dropped", cus_ent_id: droppedExtra.id },
			] as SubjectQueryRow["rollovers"],
			entitlements: [
				{ id: droppedExtra.entitlement_id },
			] as SubjectQueryRow["entitlements"],
		});

		const merged = mergeEntityAndCustomerSubjectRows({
			entityRow,
			customerRow,
		});

		expect(merged.extra_customer_entitlements).toHaveLength(
			EXTRA_CUSTOMER_ENTITLEMENT_LIMIT,
		);
		expect(
			merged.extra_customer_entitlements.map((row) => row.id),
		).not.toContain(droppedExtra.id);
		expect(merged.rollovers).toHaveLength(0);
		expect(merged.entitlements.map((row) => row.id)).not.toContain(
			droppedExtra.entitlement_id,
		);
	});

	test("dedupes shared catalog rows and subscriptions across both rows", () => {
		const entityProduct = createCustomerProduct({
			id: "cp_entity_1",
			internalProductId: "prod_shared",
			freeTrialId: "ft_shared",
			subscriptionIds: ["sub_shared"],
		});
		const customerProduct = createCustomerProduct({
			id: "cp_customer_1",
			internalProductId: "prod_shared",
			freeTrialId: "ft_shared",
			subscriptionIds: ["sub_shared"],
		});
		const sharedCatalog = {
			products: [{ internal_id: "prod_shared" }] as SubjectQueryRow["products"],
			prices: [{ id: "price_shared" }] as SubjectQueryRow["prices"],
			entitlements: [{ id: "ent_shared" }] as SubjectQueryRow["entitlements"],
			free_trials: [{ id: "ft_shared" }] as SubjectQueryRow["free_trials"],
			subscriptions: [
				{ stripe_id: "sub_shared" },
			] as SubjectQueryRow["subscriptions"],
		};

		const entityRow = createRow({
			customer_products: [entityProduct],
			customer_entitlements: [
				createCustomerEntitlement({
					id: "ce_entity",
					customerProductId: entityProduct.id,
					entitlementId: "ent_shared",
				}),
			],
			customer_prices: [
				createCustomerPrice({
					id: "cpr_entity",
					customerProductId: entityProduct.id,
					priceId: "price_shared",
				}),
			],
			...sharedCatalog,
		});
		const customerRow = createRow({
			customer_products: [customerProduct],
			customer_entitlements: [
				createCustomerEntitlement({
					id: "ce_customer",
					customerProductId: customerProduct.id,
					entitlementId: "ent_shared",
				}),
			],
			customer_prices: [
				createCustomerPrice({
					id: "cpr_customer",
					customerProductId: customerProduct.id,
					priceId: "price_shared",
				}),
			],
			...sharedCatalog,
		});

		const merged = mergeEntityAndCustomerSubjectRows({
			entityRow,
			customerRow,
		});

		expect(merged.products).toHaveLength(1);
		expect(merged.prices).toHaveLength(1);
		expect(merged.entitlements).toHaveLength(1);
		expect(merged.free_trials).toHaveLength(1);
		expect(merged.subscriptions).toHaveLength(1);
		expect(merged.customer_entitlements.map((row) => row.id)).toEqual([
			"ce_entity",
			"ce_customer",
		]);
	});

	test("sorts merged catalog rows by id to mirror DISTINCT ON ordering", () => {
		const entityProduct = createCustomerProduct({
			id: "cp_entity_1",
			internalProductId: "prod_b",
		});
		const customerProduct = createCustomerProduct({
			id: "cp_customer_1",
			internalProductId: "prod_a",
		});

		const entityRow = createRow({
			customer_products: [entityProduct],
			products: [{ internal_id: "prod_b" }] as SubjectQueryRow["products"],
		});
		const customerRow = createRow({
			customer_products: [customerProduct],
			products: [{ internal_id: "prod_a" }] as SubjectQueryRow["products"],
		});

		const merged = mergeEntityAndCustomerSubjectRows({
			entityRow,
			customerRow,
		});

		expect(merged.products.map((row) => row.internal_id)).toEqual([
			"prod_a",
			"prod_b",
		]);
	});
});
