import { expect, test } from "bun:test";
import { ms, type SyncProposalsV2Response } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	createFutureStripeSubscriptionSchedule,
	fetchFullProduct,
	getBaseStripePriceId,
} from "../utils/syncProductHelpers";

test.concurrent(
	`${chalk.yellowBright("sync-proposals-v2: future schedule without subscription is proposed")}`,
	async () => {
		const customerId = "sync-proposals-v2-schedule-only";
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

		const proposalsResponse: SyncProposalsV2Response = await autumnV1.post(
			"/billing.sync_proposals_v2",
			{ customer_id: customerId },
		);

		const proposal = proposalsResponse.proposals.find(
			(p) => p.stripe_schedule_id === schedule.id,
		);
		expect(proposal).toBeDefined();
		expect(proposal?.stripe_subscription_id).toBeUndefined();
		expect(proposal?.stripe_subscription).toBeNull();
		expect(proposal?.stripe_schedule?.id).toBe(schedule.id);
		expect(proposal?.phases).toHaveLength(1);
		expect(proposal?.phases[0]?.starts_at).toBe(
			schedule.phases[0].start_date * 1000,
		);
		expect(proposal?.phases[0]?.plans[0]?.plan_id).toBe(pro.id);
	},
);
