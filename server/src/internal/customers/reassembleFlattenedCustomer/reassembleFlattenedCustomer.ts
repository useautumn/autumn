import {
	CUSTOMER_PRODUCTS_DEFAULT_LIMIT,
	type FullCustomer,
} from "@autumn/shared";
import { buildCustomerProductsSeedByCustomer } from "../cusUtils/buildCustomerProductsSeed.js";
import { buildLookupMaps } from "./buildLookupMaps.js";
import { compareCusProducts } from "./compareCusProducts.js";
import { hydrateCustomerEntitlement } from "./hydrateCustomerEntitlement.js";
import { hydrateCustomerProduct } from "./hydrateCustomerProduct.js";
import { toTimestamp } from "./normalizeFields.js";
import type {
	FlatCustomerEntitlement,
	FlatCustomerProduct,
	FlatSubscription,
	FlattenedCustomerRow,
} from "./types.js";

export const reassembleFlattenedCustomer = (
	flat: FlattenedCustomerRow,
): FullCustomer[] => {
	const maps = buildLookupMaps(flat);

	const cesByCpId = new Map<string, unknown[]>();
	for (const ce of flat.customer_entitlements as FlatCustomerEntitlement[]) {
		if (!ce.customer_product_id) continue;
		const hydrated = hydrateCustomerEntitlement(ce, maps, { normalize: true });
		const list = cesByCpId.get(ce.customer_product_id);
		if (list) list.push(hydrated);
		else cesByCpId.set(ce.customer_product_id, [hydrated]);
	}

	const looseCesByCusId = new Map<string, unknown[]>();
	for (const ce of flat.extra_customer_entitlements as FlatCustomerEntitlement[]) {
		const hydrated = hydrateCustomerEntitlement(ce, maps, { normalize: false });
		const list = looseCesByCusId.get(ce.internal_customer_id);
		if (list) list.push(hydrated);
		else looseCesByCusId.set(ce.internal_customer_id, [hydrated]);
	}

	const pooledCesByCusId = new Map<string, unknown[]>();
	for (const ce of flat.pooled_customer_entitlements) {
		const hydrated = hydrateCustomerEntitlement(ce, maps, { normalize: false });
		const list = pooledCesByCusId.get(ce.internal_customer_id);
		if (list) list.push(hydrated);
		else pooledCesByCusId.set(ce.internal_customer_id, [hydrated]);
	}

	const cpsByCusId = new Map<
		string,
		ReturnType<typeof hydrateCustomerProduct>[]
	>();
	for (const cp of flat.customer_products as FlatCustomerProduct[]) {
		const hydratedCes = cesByCpId.get(cp.id) ?? [];
		const hydratedCp = hydrateCustomerProduct(cp, hydratedCes, maps);
		const list = cpsByCusId.get(cp.internal_customer_id);
		if (list) list.push(hydratedCp);
		else cpsByCusId.set(cp.internal_customer_id, [hydratedCp]);
	}

	for (const cps of cpsByCusId.values()) cps.sort(compareCusProducts);

	const subsByCusId = collectSubscriptionsByCustomer({
		customer_products: flat.customer_products as FlatCustomerProduct[],
		subscriptionByStripeId: maps.subscriptionByStripeId,
	});

	const entitiesByCusId = groupByInternalCustomerId(flat.entities);
	const invoicesByCusId = groupByInternalCustomerId(flat.invoices);

	const productCounts = flat.product_counts ?? {};
	const seedRows = Object.values(flat.products_seed ?? {}).flat();
	const productsPageByCusId = buildCustomerProductsSeedByCustomer({
		rows: seedRows,
		limit: CUSTOMER_PRODUCTS_DEFAULT_LIMIT,
	});
	const out: FullCustomer[] = [];
	for (const c of flat.customers) {
		const internalId = c.internal_id as string;
		const customerProducts = cpsByCusId.get(internalId) ?? [];
		const hydrated: Record<string, unknown> = {
			...c,
			created_at: toTimestamp(c.created_at),
			customer_products: customerProducts,
			products_total_count:
				productCounts[internalId] ?? customerProducts.length,
			products_page: productsPageByCusId.get(internalId) ?? {
				list: [],
				next_cursor: null,
				total_count: 0,
			},
			extra_customer_entitlements: looseCesByCusId.get(internalId) ?? [],
			pooled_customer_entitlements: pooledCesByCusId.get(internalId) ?? [],
			subscriptions: subsByCusId.get(internalId) ?? [],
		};
		if (flat.entities !== undefined) {
			hydrated.entities = entitiesByCusId.get(internalId) ?? [];
		}
		if (flat.invoices !== undefined) {
			hydrated.invoices = invoicesByCusId.get(internalId) ?? [];
		}
		out.push(hydrated as unknown as FullCustomer);
	}
	return out;
};

const groupByInternalCustomerId = (
	rows: { internal_customer_id?: string; [k: string]: unknown }[] | undefined,
): Map<string, unknown[]> => {
	const out = new Map<string, unknown[]>();
	if (!rows) return out;
	for (const row of rows) {
		const cusId = row.internal_customer_id;
		if (!cusId) continue;
		const list = out.get(cusId);
		if (list) list.push(row);
		else out.set(cusId, [row]);
	}
	return out;
};

const collectSubscriptionsByCustomer = ({
	customer_products,
	subscriptionByStripeId,
}: {
	customer_products: FlatCustomerProduct[];
	subscriptionByStripeId: Map<string, FlatSubscription>;
}): Map<string, FlatSubscription[]> => {
	const subsByCusId = new Map<string, FlatSubscription[]>();
	const seenByCusId = new Map<string, Set<string>>();

	for (const cp of customer_products) {
		if (!cp.subscription_ids?.length) continue;
		const cusId = cp.internal_customer_id;
		let subs = subsByCusId.get(cusId);
		let seen = seenByCusId.get(cusId);
		if (!subs) {
			subs = [];
			seen = new Set();
			subsByCusId.set(cusId, subs);
			seenByCusId.set(cusId, seen);
		}
		for (const subId of cp.subscription_ids) {
			if (seen!.has(subId)) continue;
			const sub = subscriptionByStripeId.get(subId);
			if (sub) {
				subs.push({ ...sub, internal_customer_id: cusId });
				seen!.add(subId);
			}
		}
	}
	return subsByCusId;
};
