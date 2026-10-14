import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const trialLengthDays = 14;

test.concurrent(
	`${chalk.yellowBright("attach free trial: a top-level free_trial is honoured, not dropped")}`,
	async () => {
		const customerId = "attach-trial-v0-shape";
		const scale = products.base({
			id: "scale-trial-v0",
			items: [items.monthlyPrice({ price: 500 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [scale] }),
			],
			actions: [],
		});

		const v0Shape = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>(
			{
				customer_id: customerId,
				plan_id: scale.id,
				free_trial: {
					card_required: true,
					duration_length: trialLengthDays,
					duration_type: "day",
				},
			} as AttachParamsV1Input,
		);

		const v1Shape = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>(
			{
				customer_id: customerId,
				plan_id: scale.id,
				customize: {
					free_trial: {
						card_required: true,
						duration_length: trialLengthDays,
						duration_type: "day",
					},
				},
			} as AttachParamsV1Input,
		);

		expect(v1Shape.total).toBe(0);
		expect(v0Shape.total).toBe(v1Shape.total);
	},
);
