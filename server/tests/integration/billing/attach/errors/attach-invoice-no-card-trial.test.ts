/**
 * Attach Invoice Mode + No-Card Trial Error Tests
 *
 * Stripe rejects a subscription that sets
 * `trial_settings.end_behavior.missing_payment_method: "cancel"` (what Autumn
 * sends for a no-card trial) together with `collection_method: "send_invoice"`
 * (what Autumn sends for invoice mode). Autumn must reject the combination
 * up front, in both preview and attach, instead of surfacing the raw Stripe
 * error at execution time.
 */

import { test } from "bun:test";
import { type AttachParamsV1Input, FreeTrialDuration } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const NO_CARD_TRIAL_INVOICE_MODE_ERROR =
	"Cannot use invoice mode with a no-card free trial";

const buildParams = ({
	customerId,
	planId,
	cardRequired,
}: {
	customerId: string;
	planId: string;
	cardRequired: boolean;
}): AttachParamsV1Input => ({
	customer_id: customerId,
	plan_id: planId,
	redirect_mode: "if_required",
	invoice_mode: {
		enabled: true,
		enable_plan_immediately: true,
		finalize: false,
	},
	customize: {
		free_trial: {
			duration_length: 15,
			duration_type: FreeTrialDuration.Day,
			card_required: cardRequired,
		},
	},
});

/**
 * Test 1: No-card trial + invoice mode is rejected by attach
 */
test.concurrent(
	`${chalk.yellowBright("error: invoice mode with no-card trial rejected on attach")}`,
	async () => {
		const customerId = "err-inv-no-card-trial-attach";

		const enterprise = products.base({
			id: "enterprise",
			items: [items.monthlyPrice({ price: 50 })],
		});

		const { autumnV2 } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [enterprise] })],
			actions: [],
		});

		await expectAutumnError({
			func: async () => {
				await autumnV2.billing.attach<AttachParamsV1Input>(
					buildParams({
						customerId,
						planId: enterprise.id,
						cardRequired: false,
					}),
				);
			},
			errMessage: NO_CARD_TRIAL_INVOICE_MODE_ERROR,
		});
	},
);

/**
 * Test 2: No-card trial + invoice mode is rejected by preview too, so callers
 * (e.g. the Slack agent) learn about the conflict before approving anything.
 */
test.concurrent(
	`${chalk.yellowBright("error: invoice mode with no-card trial rejected on preview")}`,
	async () => {
		const customerId = "err-inv-no-card-trial-preview";

		const enterprise = products.base({
			id: "enterprise",
			items: [items.monthlyPrice({ price: 50 })],
		});

		const { autumnV2 } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [enterprise] })],
			actions: [],
		});

		await expectAutumnError({
			func: async () => {
				await autumnV2.billing.previewAttach<AttachParamsV1Input>(
					buildParams({
						customerId,
						planId: enterprise.id,
						cardRequired: false,
					}),
				);
			},
			errMessage: NO_CARD_TRIAL_INVOICE_MODE_ERROR,
		});
	},
);

/**
 * Test 3 (control): card-required trial + invoice mode is allowed
 */
test.concurrent(
	`${chalk.yellowBright("control: invoice mode with card-required trial allowed")}`,
	async () => {
		const customerId = "ctrl-inv-card-trial";

		const enterprise = products.base({
			id: "enterprise",
			items: [items.monthlyPrice({ price: 50 })],
		});

		const { autumnV2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [enterprise] }),
			],
			actions: [],
		});

		await autumnV2.billing.previewAttach<AttachParamsV1Input>(
			buildParams({
				customerId,
				planId: enterprise.id,
				cardRequired: true,
			}),
		);
	},
);
