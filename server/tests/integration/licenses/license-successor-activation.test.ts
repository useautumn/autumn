import { expect, test } from "bun:test";
import type {
	ApiCustomerLicenseV0,
	AttachParamsV0Input,
} from "@autumn/shared";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { getLicenseDbState } from "./licenseTestUtils.js";

const advanceToNextCycle = async ({
	stripeCli,
	testClockId,
	advancedTo,
}: {
	stripeCli: Parameters<typeof advanceTestClock>[0]["stripeCli"];
	testClockId?: string;
	advancedTo: number;
}) => {
	if (!testClockId) throw new Error("testClock not enabled");
	const cycleEnd = addMonths(new Date(advancedTo), 1);
	await advanceTestClock({
		stripeCli,
		testClockId,
		advanceTo: cycleEnd.getTime(),
		waitForSeconds: 30,
	});
	await advanceTestClock({
		stripeCli,
		testClockId,
		numberOfHours: hoursToFinalizeInvoice,
		startingFrom: cycleEnd,
		waitForSeconds: 30,
	});
};

test.concurrent(
	`${chalk.yellowBright("licenses successor activation: pool created when scheduled downgrade with license activates")}`,
	async () => {
		const premium = products.premium({
			id: "lic-act-premium",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});
		const pro = products.pro({
			id: "lic-act-pro",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "lic-act-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { customerId, autumnV1, autumnV2_2, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "lic-successor-activation",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [premium, pro, license] }),
				],
				actions: [
					s.licenses.link({
						parentProductId: pro.id,
						licenseProductId: license.id,
						included: 2,
					}),
					s.billing.attach({ productId: premium.id }),
				],
			});

		await autumnV1.billing.attach<AttachParamsV0Input>({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		const scheduledPools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: ApiCustomerLicenseV0[] };
		expect(scheduledPools.list).toHaveLength(0);

		await timeout(4000);
		await advanceToNextCycle({
			stripeCli: ctx.stripeCli,
			testClockId,
			advancedTo,
		});
		const dbState = await getLicenseDbState({ db: ctx.db, customerId });
		expect(dbState.pools).toHaveLength(1);
		expect(dbState.pools[0]).toMatchObject({ granted: 2, remaining: 2 });

		const pools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: ApiCustomerLicenseV0[] };
		expect(pools.list).toHaveLength(1);
		expect(pools.list[0]).toMatchObject({
			granted: 2,
			usage: 0,
			remaining: 2,
		});
	},
);

// Schedule-phase activation doesn't migrate assignments yet (webhook path only reconciles counters).
test.todo(
	"licenses successor activation: scheduled downgrade re-parents an existing assignment",
	() => {},
);

// Schedule-phase activation doesn't expire unsupported assignments yet (webhook path only reconciles counters).
test.todo(
	"licenses successor activation: scheduled downgrade ends an unsupported assignment at activation",
	() => {},
);
