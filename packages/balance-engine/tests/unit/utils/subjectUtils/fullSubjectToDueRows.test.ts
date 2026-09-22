import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	BillingInterval,
	BillWhen,
	CusProductStatus,
	EntInterval,
	FeatureType,
	type Price,
	PriceType,
} from "@autumn/shared";
import {
	type Catalog,
	createSubjectState,
	fullSubjectToDueRows,
	subjectStateToFullSubject,
	type WorkerCustomerEntitlement,
	type WorkerCustomerProduct,
} from "../../../../src/balanceEngine.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
	occurredAt,
} from "../../engineFixtures.js";

const asOf = occurredAt;
const overdue = asOf - 1;

const ROW_ID = "messages_monthly";
const ENTITLEMENT_ID = `ent_${ROW_ID}`;
const PRICE_ID = "price_messages";

const priceOf = ({
	billWhen,
	interval,
}: {
	billWhen: BillWhen;
	interval: BillingInterval;
}): Price => ({
	id: PRICE_ID,
	internal_product_id: "prod_internal_pro",
	entitlement_id: ENTITLEMENT_ID,
	proration_config: null,
	config: {
		type: PriceType.Usage,
		bill_when: billWhen,
		billing_units: 100,
		internal_feature_id: "feat_messages",
		feature_id: "messages",
		usage_tiers: [],
		interval,
	},
});

/** One row under one plan; `catalog` and `product` patch the catalog and plan the row hangs off. */
const dueRowIds = ({
	row = {},
	product = {},
	catalog = () => {},
	price,
}: {
	row?: Partial<WorkerCustomerEntitlement>;
	product?: Partial<WorkerCustomerProduct>;
	catalog?: (catalog: Catalog) => void;
	price?: Price;
} = {}): string[] => {
	const customerProduct = { ...createCustomerProduct(), ...product };
	const state = createSubjectState({
		identity,
		customerProducts: [customerProduct],
		customerPrices: price
			? [
					{
						id: "cpr_1",
						internal_customer_id: "cus_internal_1",
						customer_product_id: customerProduct.id,
						price_id: price.id,
						created_at: occurredAt,
					},
				]
			: [],
		customerEntitlements: [
			{
				...createCustomerEntitlement({ id: ROW_ID }),
				next_reset_at: overdue,
				...row,
			},
		],
	});
	const joined = createCatalogFor({ state });
	if (price) joined.prices[price.id] = price;
	catalog(joined);
	return fullSubjectToDueRows({
		fullSubject: subjectStateToFullSubject({ state, catalog: joined }),
		asOf,
	}).map((due) => due.id);
};

describe("fullSubjectToDueRows", () => {
	test("an overdue row on an active plan is due", () => {
		expect(dueRowIds()).toEqual([ROW_ID]);
	});

	test("a row is overdue only strictly before asOf", () => {
		expect(dueRowIds({ row: { next_reset_at: asOf } })).toEqual([]);
		expect(dueRowIds({ row: { next_reset_at: asOf + 1 } })).toEqual([]);
		expect(dueRowIds({ row: { next_reset_at: null } })).toEqual([]);
	});

	test("a loose grant refills on its own", () => {
		expect(dueRowIds({ row: { customer_product_id: null } })).toEqual([ROW_ID]);
	});

	test("lifetime, unlimited and boolean grants never refill", () => {
		expect(
			dueRowIds({
				catalog: (catalog) => {
					catalog.entitlements[ENTITLEMENT_ID].interval = EntInterval.Lifetime;
				},
			}),
		).toEqual([]);
		expect(
			dueRowIds({
				catalog: (catalog) => {
					catalog.entitlements[ENTITLEMENT_ID].allowance_type =
						AllowanceType.Unlimited;
				},
			}),
		).toEqual([]);
		expect(
			dueRowIds({
				catalog: (catalog) => {
					catalog.features.feat_messages.type = FeatureType.Boolean;
				},
			}),
		).toEqual([]);
	});

	test("a past-due plan refills only when its product ignores past due", () => {
		expect(
			dueRowIds({ product: { status: CusProductStatus.PastDue } }),
		).toEqual([]);
		expect(
			dueRowIds({
				product: { status: CusProductStatus.PastDue },
				catalog: (catalog) => {
					catalog.products.prod_internal_pro.config.ignore_past_due = true;
				},
			}),
		).toEqual([ROW_ID]);
	});

	test("a scheduled plan does not refill", () => {
		expect(
			dueRowIds({ product: { status: CusProductStatus.Scheduled } }),
		).toEqual([]);
	});

	test("a billed row is left to its invoice", () => {
		expect(
			dueRowIds({
				price: priceOf({
					billWhen: BillWhen.EndOfPeriod,
					interval: BillingInterval.Month,
				}),
			}),
		).toEqual([]);
		expect(
			dueRowIds({
				price: priceOf({
					billWhen: BillWhen.InAdvance,
					interval: BillingInterval.Month,
				}),
			}),
		).toEqual([]);
	});

	test("a prepaid row on its own reset interval still refills", () => {
		expect(
			dueRowIds({
				price: priceOf({
					billWhen: BillWhen.InAdvance,
					interval: BillingInterval.Year,
				}),
			}),
		).toEqual([ROW_ID]);
	});
});
