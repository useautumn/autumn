import { expect, test } from "bun:test";
import {
	CusProductStatus,
	ErrCode,
	ms,
	type SyncParamsV1,
} from "@autumn/shared";
import { expectCustomerProductStatuses } from "@tests/integration/billing/utils/expectCustomerProductStatuses";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { getCustomerProduct } from "../attach/params/start-date/utils";
import {
	createFutureStripeSubscriptionSchedule,
	fetchFullProduct,
	getBaseStripePriceId,
} from "./utils/syncProductHelpers";

test.concurrent(
	`${chalk.yellowBright("sync-v2: future schedule without subscription creates scheduled product")}`,
	async () => {
		const customerId = "sync-v2-schedule-only";
		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const proFull = await fetchFullProduct({ ctx, productId: pro.id });
		const proPriceId = getBaseStripePriceId({ fullProduct: proFull });
		const schedule = await createFutureStripeSubscriptionSchedule({
			ctx,
			customerId,
			startDateMs: Date.now() + ms.days(1),
			phases: [{ items: [{ price: proPriceId }] }],
		});
		const startsAt = schedule.phases[0].start_date * 1000;

		const result = await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_schedule_id: schedule.id,
			phases: [{ starts_at: startsAt, plans: [{ plan_id: pro.id }] }],
		} satisfies SyncParamsV1);

		expect(result.stripe_subscription_id).toBeNull();
		expect(result.stripe_schedule_id).toBe(schedule.id);
		expect(result.inserted_cus_product_ids).toHaveLength(1);

		const cusProduct = await getCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct.status).toBe(CusProductStatus.Scheduled);
		expect(cusProduct.starts_at).toBe(startsAt);
		expect(cusProduct.access_starts_at).toBeNull();
		expect(cusProduct.subscription_ids ?? []).toEqual([]);
		expect(cusProduct.scheduled_ids).toEqual([schedule.id]);
	},
);

test.concurrent(
	`${chalk.yellowBright("sync-v2: schedule-only plan can enable access immediately")}`,
	async () => {
		const customerId = "sync-v2-schedule-only-enable-now";
		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const proFull = await fetchFullProduct({ ctx, productId: pro.id });
		const proPriceId = getBaseStripePriceId({ fullProduct: proFull });
		const schedule = await createFutureStripeSubscriptionSchedule({
			ctx,
			customerId,
			startDateMs: advancedTo + ms.days(1),
			phases: [{ items: [{ price: proPriceId }] }],
		});
		const startsAt = schedule.phases[0].start_date * 1000;

		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_schedule_id: schedule.id,
			phases: [
				{
					starts_at: startsAt,
					plans: [
						{
							plan_id: pro.id,
							enable_plan_immediately: true,
						},
					],
				},
			],
		} satisfies SyncParamsV1);

		const cusProduct = await getCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct.status).toBe(CusProductStatus.Active);
		expect(cusProduct.starts_at).toBe(startsAt);
		expect(Math.abs(cusProduct.access_starts_at! - advancedTo)).toBeLessThan(
			ms.minutes(10),
		);
		expect(cusProduct.subscription_ids ?? []).toEqual([]);
		expect(cusProduct.scheduled_ids).toEqual([schedule.id]);
	},
);

// Pre-fix: scheduled sync ignored expire_previous because setup skipped transition lookup for future phases.
// Post-fix: the first scheduled phase expires the active product in the same group.
test.concurrent(
	`${chalk.yellowBright("sync-v2: future schedule expires previous product in same group")}`,
	async () => {
		const customerId = "sync-v2-schedule-only-expire-previous";
		const free = products.base({ id: "free", items: [], group: "main" });
		const pro = products.pro({ id: "pro", items: [], group: "main" });

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [s.attach({ productId: free.id })],
		});

		const proFull = await fetchFullProduct({ ctx, productId: pro.id });
		const schedule = await createFutureStripeSubscriptionSchedule({
			ctx,
			customerId,
			startDateMs: Date.now() + ms.days(1),
			phases: [
				{ items: [{ price: getBaseStripePriceId({ fullProduct: proFull }) }] },
			],
		});
		const startsAt = schedule.phases[0].start_date * 1000;

		const result = await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_schedule_id: schedule.id,
			phases: [
				{
					starts_at: startsAt,
					plans: [{ plan_id: pro.id, expire_previous: true }],
				},
			],
		} satisfies SyncParamsV1);

		expect(result.expired_cus_product_ids).toHaveLength(1);

		await expectCustomerProductStatuses({
			ctx,
			customerId,
			productId: free.id,
			expected: { [CusProductStatus.Expired]: 1 },
		});

		const proCusProduct = await getCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(proCusProduct.status).toBe(CusProductStatus.Scheduled);
		expect(proCusProduct.starts_at).toBe(startsAt);
	},
);

test.concurrent(
	`${chalk.yellowBright("sync-v2: enable_plan_immediately rejects later future phases")}`,
	async () => {
		const customerId = "sync-v2-schedule-enable-later-phase";
		const pro = products.pro({ id: "pro", items: [] });
		const premium = products.premium({ id: "premium", items: [] });

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const [proFull, premiumFull] = await Promise.all([
			fetchFullProduct({ ctx, productId: pro.id }),
			fetchFullProduct({ ctx, productId: premium.id }),
		]);
		const schedule = await createFutureStripeSubscriptionSchedule({
			ctx,
			customerId,
			startDateMs: Date.now() + ms.days(1),
			phases: [
				{ items: [{ price: getBaseStripePriceId({ fullProduct: proFull }) }] },
				{
					items: [
						{ price: getBaseStripePriceId({ fullProduct: premiumFull }) },
					],
				},
			],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage:
				"enable_plan_immediately can only be used on plans in the first future sync phase",
			func: async () => {
				await autumnV1.post("/billing.sync_v2", {
					customer_id: customerId,
					stripe_schedule_id: schedule.id,
					phases: [
						{
							starts_at: schedule.phases[0].start_date * 1000,
							plans: [{ plan_id: pro.id }],
						},
						{
							starts_at: schedule.phases[1].start_date * 1000,
							plans: [
								{
									plan_id: premium.id,
									enable_plan_immediately: true,
								},
							],
						},
					],
				} satisfies SyncParamsV1);
			},
		});
	},
);
