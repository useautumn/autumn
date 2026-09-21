import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type Customer,
	type Entity,
	type FullCusProduct,
	type FullSubject,
	getApiCustomerBaseV2,
	getApiEntityBaseV2,
	getApiSubject,
	getCusProcessors,
	ProcessorType,
	subjectWithoutEntityData,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { customers } from "@tests/utils/fixtures/db/customers";
import { entities } from "@tests/utils/fixtures/db/entities";

/** How a customer and an entity read in the API, from the subject's rows alone. */

const CREATED_AT = 1_700_000_000_000;

const contextOf = ({ expand = [] }: { expand?: string[] } = {}) => ({
	...contexts.create({}),
	expand,
});

const customerOf = (overrides: Partial<Customer> = {}): Customer => ({
	...customers.create({}),
	created_at: CREATED_AT,
	...overrides,
});

const seatOf = (overrides: Partial<Entity> = {}): Entity => ({
	...entities.create({ id: "seat_1", featureId: "seats", name: "Seat one" }),
	created_at: CREATED_AT,
	...overrides,
});

const subjectOf = ({
	customer = customerOf(),
	entity,
	plans = [],
	overrides = {},
}: {
	customer?: Customer;
	entity?: Entity;
	plans?: FullCusProduct[];
	overrides?: Partial<FullSubject>;
} = {}): FullSubject => ({
	subjectType: entity ? "entity" : "customer",
	customerId: customer.id ?? "",
	internalCustomerId: customer.internal_id,
	entityId: entity?.id ?? undefined,
	internalEntityId: entity?.internal_id,
	customer,
	entity,
	customer_products: plans,
	extra_customer_entitlements: [],
	pooled_customer_entitlements: [],
	invoices: [],
	...overrides,
});

const planOn = (
	params: Partial<Parameters<typeof customerProducts.create>[0]> = {},
) =>
	customerProducts.create({ id: "cus_prod_pro", productId: "pro", ...params });

describe("a customer", () => {
	test("reads its identity, and our id for it by default", async () => {
		const { apiCustomer } = await getApiCustomerBaseV2({
			ctx: contextOf(),
			fullSubject: subjectOf(),
		});

		expect(apiCustomer).toMatchObject({
			autumn_id: "cus_internal_test",
			id: "cus_test",
			name: "Test Customer",
			email: "test@example.com",
			fingerprint: null,
			stripe_id: "cus_stripe_test",
			env: "sandbox",
			created_at: CREATED_AT,
			metadata: {},
			send_email_receipts: false,
		});
	});

	test("our id is left out when not asked for", async () => {
		const { apiCustomer } = await getApiCustomerBaseV2({
			ctx: contextOf(),
			fullSubject: subjectOf(),
			withAutumnId: false,
		});

		expect(apiCustomer.autumn_id).toBeUndefined();
	});

	test("blank identity fields read as null, missing metadata as empty", async () => {
		const { apiCustomer } = await getApiCustomerBaseV2({
			ctx: contextOf(),
			fullSubject: subjectOf({
				customer: customerOf({
					id: null,
					name: "",
					email: "",
					processor: null,
					metadata: null,
				}),
			}),
		});

		expect(apiCustomer.id).toBeNull();
		expect(apiCustomer.name).toBeNull();
		expect(apiCustomer.email).toBeNull();
		expect(apiCustomer.stripe_id).toBeNull();
		expect(apiCustomer.metadata).toEqual({});
	});

	test("with no plans it has no subscriptions, purchases, licenses, balances or flags", async () => {
		const { apiCustomer, legacyData } = await getApiCustomerBaseV2({
			ctx: contextOf(),
			fullSubject: subjectOf(),
		});

		expect(apiCustomer.subscriptions).toEqual([]);
		expect(apiCustomer.purchases).toEqual([]);
		expect(apiCustomer.licenses).toEqual([]);
		expect(apiCustomer.balances).toEqual({});
		expect(apiCustomer.flags).toEqual({});
		expect(legacyData).toEqual({ cusProductLegacyData: {} });
	});

	test("a plan it holds is a subscription, with its legacy data keyed by plan", async () => {
		const { apiCustomer, legacyData } = await getApiCustomerBaseV2({
			ctx: contextOf(),
			fullSubject: subjectOf({
				plans: [planOn({ subscriptionIds: ["sub_stripe"] })],
			}),
		});

		expect(apiCustomer.subscriptions.map(({ plan_id }) => plan_id)).toEqual([
			"pro",
		]);
		expect(legacyData.cusProductLegacyData.pro?.subscription_id).toBe(
			"sub_stripe",
		);
	});

	test("the plan object rides on a subscription under subscriptions.plan", async () => {
		const { apiCustomer } = await getApiCustomerBaseV2({
			ctx: contextOf({ expand: ["subscriptions.plan"] }),
			fullSubject: subjectOf({ plans: [planOn()] }),
		});

		expect(apiCustomer.subscriptions[0].plan?.id).toBe("pro");
	});

	test("its billing controls are its own columns", async () => {
		const spendLimits = [
			{ feature_id: "messages", enabled: true, overage_limit: 50 },
		];
		const usageAlerts = [
			{
				feature_id: "messages",
				threshold: 80,
				threshold_type: "usage_percentage",
			},
		];
		const { apiCustomer } = await getApiCustomerBaseV2({
			ctx: contextOf(),
			fullSubject: subjectOf({
				customer: customerOf({
					spend_limits: spendLimits,
					usage_alerts: usageAlerts,
				} as Partial<Customer>),
			}),
		});

		expect(apiCustomer.billing_controls?.spend_limits).toEqual(spendLimits);
		expect(apiCustomer.billing_controls?.usage_alerts).toMatchObject(
			usageAlerts,
		);
	});

	test("its config carries only the two public switches", async () => {
		const { apiCustomer } = await getApiCustomerBaseV2({
			ctx: contextOf(),
			fullSubject: subjectOf({
				customer: customerOf({
					config: { disable_pooled_balance: true },
				}),
			}),
		});

		expect(apiCustomer.config).toEqual({ disable_pooled_balance: true });
	});

	test("has no invoices unless the caller hands them in", async () => {
		const { apiCustomer } = await getApiCustomerBaseV2({
			ctx: contextOf({ expand: ["invoices"] }),
			fullSubject: subjectOf(),
		});

		expect(apiCustomer.invoices).toBeUndefined();
	});

	test("carries the invoices it is handed, as they are", async () => {
		const invoices = [
			{
				plan_ids: ["pro"],
				stripe_id: "in_123",
				processor_type: ProcessorType.Stripe,
				status: "paid",
				total: 20,
				currency: "usd",
				created_at: CREATED_AT,
				hosted_invoice_url:
					"https://api.example.com/invoices/hosted_invoice_url/inv_1",
			},
		];
		const { apiCustomer } = await getApiCustomerBaseV2({
			ctx: contextOf(),
			fullSubject: subjectOf(),
			invoices,
		});

		expect(apiCustomer.invoices).toEqual(invoices);
	});
});

describe("a customer's processors", () => {
	test("none at all is no processors key", () => {
		expect(
			getCusProcessors({
				customer: customerOf({ processor: null, processors: null }),
				customer_products: [],
			}),
		).toBeUndefined();
	});

	test("a Stripe customer names its Stripe id", () => {
		expect(
			getCusProcessors({ customer: customerOf(), customer_products: [] }),
		).toEqual({
			stripe: { id: "cus_stripe_test" },
			vercel: undefined,
			revenuecat: undefined,
		});
	});

	test("Vercel shows only its two public ids, never a token", () => {
		const processors = getCusProcessors({
			customer: customerOf({
				processors: {
					vercel: {
						installation_id: "icfg_1",
						account_id: "acct_1",
						access_token: "secret_token",
						custom_payment_method_id: "pm_secret",
					},
				},
			} as Partial<Customer>),
			customer_products: [],
		});

		expect(processors?.vercel).toEqual({
			installation_id: "icfg_1",
			account_id: "acct_1",
		});
	});

	test("RevenueCat shows only while a RevenueCat plan is active", () => {
		const active = getCusProcessors({
			customer: customerOf(),
			customer_products: [planOn({ processorType: ProcessorType.RevenueCat })],
		});
		const expired = getCusProcessors({
			customer: customerOf(),
			customer_products: [
				planOn({
					processorType: ProcessorType.RevenueCat,
					status: CusProductStatus.Expired,
				}),
			],
		});

		expect(active?.revenuecat).toEqual({ id: "cus_test" });
		expect(expired?.revenuecat).toBeUndefined();
	});

	test("RevenueCat prefers its own id for the customer over ours", () => {
		const processors = getCusProcessors({
			customer: customerOf({
				processors: { revenuecat: { id: "rc_user_1" } },
			} as Partial<Customer>),
			customer_products: [planOn({ processorType: ProcessorType.RevenueCat })],
		});

		expect(processors?.revenuecat).toEqual({ id: "rc_user_1" });
	});
});

describe("an entity", () => {
	test("reads its identity and the customer it belongs to", async () => {
		const { apiEntity } = await getApiEntityBaseV2({
			ctx: contextOf(),
			fullSubject: subjectOf({ entity: seatOf() }),
		});

		expect(apiEntity).toMatchObject({
			id: "seat_1",
			name: "Seat one",
			customer_id: "cus_test",
			feature_id: "seats",
			created_at: CREATED_AT,
			env: "sandbox",
			subscriptions: [],
			purchases: [],
			balances: {},
			flags: {},
		});
		expect(apiEntity.autumn_id).toBeUndefined();
		expect(apiEntity.invoices).toBeUndefined();
	});

	test("our id for it is included only when asked for", async () => {
		const { apiEntity } = await getApiEntityBaseV2({
			ctx: contextOf(),
			fullSubject: subjectOf({ entity: seatOf() }),
			withAutumnId: true,
		});

		expect(apiEntity.autumn_id).toBe("internal_seat_1");
	});

	test("a customer with no id of its own is named by ours", async () => {
		const { apiEntity } = await getApiEntityBaseV2({
			ctx: contextOf(),
			fullSubject: subjectOf({
				customer: customerOf({ id: null }),
				entity: seatOf(),
			}),
		});

		expect(apiEntity.customer_id).toBe("cus_internal_test");
	});

	test("its billing controls are the entity's columns, not the customer's", async () => {
		const entityLimits = [
			{ feature_id: "messages", enabled: true, overage_limit: 5 },
		];
		const { apiEntity } = await getApiEntityBaseV2({
			ctx: contextOf(),
			fullSubject: subjectOf({
				customer: customerOf({
					spend_limits: [
						{ feature_id: "messages", enabled: true, overage_limit: 500 },
					],
				} as Partial<Customer>),
				entity: seatOf({ spend_limits: entityLimits } as Partial<Entity>),
			}),
		});

		expect(apiEntity.billing_controls?.spend_limits).toEqual(entityLimits);
	});

	test("a subject with no entity cannot be read as one", async () => {
		const failure = await getApiEntityBaseV2({
			ctx: contextOf(),
			fullSubject: subjectOf(),
		}).catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(Error);
	});
});

describe("whichever the subject is", () => {
	test("an entity subject reads as the entity", async () => {
		const subject = await getApiSubject({
			ctx: contextOf(),
			fullSubject: subjectOf({ entity: seatOf() }),
			includeAggregations: false,
		});

		expect(subject.id).toBe("seat_1");
		expect("customer_id" in subject).toBe(true);
	});

	test("a customer subject reads as the customer, with our id", async () => {
		const subject = await getApiSubject({
			ctx: contextOf(),
			fullSubject: subjectOf(),
			includeAggregations: false,
		});

		expect(subject.id).toBe("cus_test");
		expect(subject.autumn_id).toBe("cus_internal_test");
	});

	test("a customer's entity plans are counted only when aggregations are asked for", async () => {
		const fullSubject = subjectOf({
			plans: [planOn()],
			overrides: {
				aggregated_customer_products: [
					planOn({ id: "cus_prod_seat", productId: "seat" }),
				],
			},
		});
		const plansOf = async (includeAggregations: boolean) => {
			const subject = await getApiSubject({
				ctx: contextOf(),
				fullSubject,
				includeAggregations,
			});
			return subject.subscriptions.map(({ plan_id }) => plan_id);
		};

		expect(await plansOf(false)).toEqual(["pro"]);
		expect(await plansOf(true)).toEqual(["pro", "seat"]);
	});

	test("dropping entity data clears the three aggregates and nothing else", () => {
		const fullSubject = subjectOf({
			plans: [planOn()],
			overrides: {
				aggregated_customer_products: [planOn()],
				aggregated_customer_entitlements: [],
				aggregated_subject_flags: {},
			},
		});
		const stripped = subjectWithoutEntityData({ fullSubject });

		expect(stripped.aggregated_customer_products).toBeUndefined();
		expect(stripped.aggregated_customer_entitlements).toBeUndefined();
		expect(stripped.aggregated_subject_flags).toBeUndefined();
		expect(stripped.customer_products).toBe(fullSubject.customer_products);
	});
});
