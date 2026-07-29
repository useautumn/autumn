/** Red: an attached coupon keeps discounting an excluded upgrade after its product scope is updated.
 * Green: the excluded plan gets no discount and the invoice matches its corrected preview. */
import { expect, test } from "bun:test";
import { type AttachPreviewResponse, RewardType } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructCoupon } from "@/utils/scriptUtils/createTestProducts.js";

test(chalk.yellowBright(
	"coupon update stops applying an attached discount to excluded plans",
), async () => {
	const customerId = "coupon-update-product-scope";
	const promoCode = `SCOPE${Date.now()}`;
	const current = products.base({
		id: "current",
		items: [items.monthlyPrice({ price: 20 })],
	});
	const excluded = products.base({
		id: "excluded",
		items: [items.annualPrice({ price: 240 })],
	});
	const reward = constructCoupon({
		id: "scope-coupon",
		promoCode,
		discountType: RewardType.PercentageDiscount,
		discountValue: 20,
	});

	const { autumnV1, autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [current, excluded] }),
			s.reward({ reward, productId: current.id }),
		],
		actions: [],
	});

	await autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: current.id,
		discounts: [{ promotion_code: promoCode }],
	});

	reward.discount_config!.apply_to_all = false;
	await autumnV1.rewards.update({ internalId: reward.id, reward });

	const preview = (await autumnV2_2.billing.previewAttach({
		customer_id: customerId,
		plan_id: excluded.id,
	})) as AttachPreviewResponse;
	const excludedLine = preview.line_items.find(
		(lineItem) => lineItem.plan_id === excluded.id,
	);

	expect(excludedLine).toBeDefined();
	expect(excludedLine?.discounts).not.toContainEqual(
		expect.objectContaining({ reward_id: reward.id }),
	);

	const result = await autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: excluded.id,
	});
	expect(result.invoice?.total).toBeCloseTo(preview.total, 2);
}, 300_000);
