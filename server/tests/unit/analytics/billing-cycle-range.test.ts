import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	CusProductStatus,
	EntInterval,
	FeatureType,
	type FullCustomer,
	PriceType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getBillingCycleStartDate } from "@/internal/analytics/analyticsUtils.js";

const SUBSCRIPTION_ANCHOR = Date.UTC(2026, 1, 4);
const SHORTEST_PERIOD_START = Date.UTC(2026, 7, 4);
const SHORTEST_PERIOD_END = Date.UTC(2026, 8, 4);

const mixedCadenceCustomer = () =>
	({
		customer_products: [
			{
				id: "cus_prod_enterprise",
				status: CusProductStatus.Active,
				created_at: SUBSCRIPTION_ANCHOR,
				billing_cycle_anchor: SUBSCRIPTION_ANCHOR,
				subscription_ids: ["sub_enterprise"],
				product: { id: "enterprise", is_add_on: false },
				customer_prices: [
					{
						price: {
							id: "price_yearly_base",
							config: {
								type: PriceType.Fixed,
								amount: 20_000,
								interval: BillingInterval.Year,
							},
						},
					},
					{
						price: {
							id: "price_monthly_usage",
							config: {
								type: PriceType.Usage,
								bill_when: BillWhen.EndOfPeriod,
								interval: BillingInterval.Month,
								internal_feature_id: "feature_credits",
								feature_id: "credits",
								usage_tiers: [{ to: -1, amount: 1 }],
							},
						},
					},
				],
				customer_entitlements: [],
			},
		],
		subscriptions: [
			{
				stripe_id: "sub_enterprise",
				created_at: SUBSCRIPTION_ANCHOR / 1000,
				current_period_start: SHORTEST_PERIOD_START / 1000,
				current_period_end: SHORTEST_PERIOD_END / 1000,
			},
		],
	}) as unknown as FullCustomer;

afterEach(() => setSystemTime());

describe("analytics billing-cycle ranges", () => {
	test("keeps the shortest Stripe item period on its exact boundaries", async () => {
		setSystemTime(new Date(Date.UTC(2026, 8, 1)));

		const result = await getBillingCycleStartDate({
			customer: mixedCadenceCustomer(),
			db: {} as AutumnContext["db"],
			ctx: {} as AutumnContext,
			intervalType: "1bc",
		});

		expect(result).toEqual({
			startDate: "2026-08-04 00:00:00",
			endDate: "2026-09-04 00:00:00",
			gap: 31,
		});
	});

	describe("feature-scoped cycles on a mixed-interval subscription", () => {
		const SUB_START = Date.UTC(2026, 6, 7, 22, 53, 37);
		const HALF_YEAR_END = Date.UTC(2027, 0, 7, 22, 53, 37);
		const NEXT_MONTHLY_RESET = Date.UTC(2026, 9, 7, 22, 53, 37);

		const customerEntitlement = ({
			featureId,
			featureType = FeatureType.Metered,
			interval,
			nextResetAt,
		}: {
			featureId: string;
			featureType?: FeatureType;
			interval: EntInterval;
			nextResetAt: number | null;
		}) => ({
			id: `cus_ent_${featureId}_${interval}`,
			created_at: SUB_START,
			next_reset_at: nextResetAt,
			entitlement: {
				interval,
				interval_count: 1,
				feature: {
					id: featureId,
					type: featureType,
					config:
						featureType === FeatureType.CreditSystem
							? { schema: [{ metered_feature_id: "chat_messages" }] }
							: {},
				},
			},
		});

		// The subscriptions row holds the widest item period, as billing v2 writes it.
		const halfYearCustomer = (customerEntitlements: unknown[]) =>
			({
				customer_products: [
					{
						id: "cus_prod_enterprise",
						status: CusProductStatus.Active,
						created_at: SUB_START,
						subscription_ids: ["sub_enterprise"],
						product: { id: "enterprise", is_add_on: false },
						customer_prices: [
							{
								price: {
									id: "price_half_year_base",
									config: {
										type: PriceType.Fixed,
										amount: 5_000,
										interval: BillingInterval.SemiAnnual,
									},
								},
							},
						],
						customer_entitlements: customerEntitlements,
					},
				],
				subscriptions: [
					{
						stripe_id: "sub_enterprise",
						created_at: SUB_START / 1000,
						current_period_start: SUB_START / 1000,
						current_period_end: HALF_YEAR_END / 1000,
					},
				],
			}) as unknown as FullCustomer;

		const resolve = ({
			customer,
			featureIds,
		}: {
			customer: FullCustomer;
			featureIds?: string[];
		}) =>
			getBillingCycleStartDate({
				customer,
				db: {} as AutumnContext["db"],
				ctx: {} as AutumnContext,
				intervalType: "1bc",
				featureIds,
			});

		test("uses the charted feature's monthly reset cycle, not the half-year row", async () => {
			setSystemTime(new Date(Date.UTC(2026, 8, 23)));

			const result = await resolve({
				customer: halfYearCustomer([
					customerEntitlement({
						featureId: "ai_credits",
						interval: EntInterval.Month,
						nextResetAt: NEXT_MONTHLY_RESET,
					}),
				]),
				featureIds: ["ai_credits"],
			});

			expect(result).toEqual({
				startDate: "2026-09-07 22:53:37",
				endDate: "2026-10-07 22:53:37",
				gap: 30,
			});
		});

		test("resolves a metered event through the credit system funding it", async () => {
			setSystemTime(new Date(Date.UTC(2026, 8, 23)));

			const result = await resolve({
				customer: halfYearCustomer([
					customerEntitlement({
						featureId: "ai_credits",
						featureType: FeatureType.CreditSystem,
						interval: EntInterval.Month,
						nextResetAt: NEXT_MONTHLY_RESET,
					}),
				]),
				featureIds: ["chat_messages"],
			});

			expect(result).toMatchObject({
				startDate: "2026-09-07 22:53:37",
				endDate: "2026-10-07 22:53:37",
			});
		});

		test("stays on the current cycle when next_reset_at is stale", async () => {
			setSystemTime(new Date(Date.UTC(2026, 8, 23)));

			const result = await resolve({
				customer: halfYearCustomer([
					customerEntitlement({
						featureId: "ai_credits",
						interval: EntInterval.Month,
						nextResetAt: Date.UTC(2026, 7, 7, 22, 53, 37),
					}),
				]),
				featureIds: ["ai_credits"],
			});

			expect(result).toMatchObject({
				startDate: "2026-09-07 22:53:37",
				endDate: "2026-10-07 22:53:37",
			});
		});

		test("picks the shortest cycle across several charted features", async () => {
			setSystemTime(new Date(Date.UTC(2026, 8, 23)));

			const result = await resolve({
				customer: halfYearCustomer([
					customerEntitlement({
						featureId: "seats",
						interval: EntInterval.Year,
						nextResetAt: Date.UTC(2027, 6, 7, 22, 53, 37),
					}),
					customerEntitlement({
						featureId: "ai_credits",
						interval: EntInterval.Month,
						nextResetAt: NEXT_MONTHLY_RESET,
					}),
				]),
				featureIds: ["seats", "ai_credits"],
			});

			expect(result).toMatchObject({
				startDate: "2026-09-07 22:53:37",
				endDate: "2026-10-07 22:53:37",
			});
		});

		test("falls back to the subscription row when no charted feature resets", async () => {
			setSystemTime(new Date(Date.UTC(2026, 8, 23)));

			const result = await resolve({
				customer: halfYearCustomer([
					customerEntitlement({
						featureId: "ai_credits",
						interval: EntInterval.Lifetime,
						nextResetAt: null,
					}),
				]),
				featureIds: ["ai_credits"],
			});

			expect(result).toMatchObject({
				startDate: "2026-07-07 22:53:37",
				endDate: "2027-01-07 22:53:37",
			});
		});
	});
});
