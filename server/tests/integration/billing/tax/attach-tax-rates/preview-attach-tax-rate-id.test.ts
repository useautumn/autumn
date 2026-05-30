/**
 * Preview attach with explicit `tax_rate_id`: the preview response must
 * populate `tax` and reflect the rate in `total`, mirroring how
 * `automatic-tax-preview-attach-immediate.test.ts` validates the
 * `automatic_tax` branch.
 *
 * Three cases:
 *  - exclusive 10% rate → preview.tax.amount_exclusive > 0,
 *    preview.total = subtotal + tax.total
 *  - inclusive 10% rate → preview.tax.amount_inclusive > 0,
 *    preview.total = subtotal (tax does not inflate the charge)
 *  - no tax_rate_id, automatic_tax off → preview.tax === undefined
 *    (regression guard for the existing branch)
 */

import { expect, test } from "bun:test";
import type { AttachPreviewResponse } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("preview-attach-tax-rate-id (exclusive 10%): preview returns tax.status=complete and inflates total")}`,
	async () => {
		const customerId = "preview-tax-rate-exclusive";
		const proProd = products.pro({ id: "pro", items: [] });

		const { ctx, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proProd] }),
			],
			actions: [],
		});

		const taxRate = await ctx.stripeCli.taxRates.create({
			display_name: "Test Tax Exclusive",
			percentage: 10,
			inclusive: false,
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: proProd.id,
			tax_rate_id: taxRate.id,
		})) as AttachPreviewResponse;

		expect(preview.tax).toBeDefined();
		expect(preview.tax?.status).toBe("complete");
		expect(preview.tax?.currency).toBe(preview.currency);
		expect(preview.tax?.amount_exclusive).toBeGreaterThan(0);
		expect(preview.tax?.amount_inclusive).toBe(0);
		expect(preview.tax?.total).toBeCloseTo(preview.subtotal * 0.1, 2);

		expect(preview.total).toBeCloseTo(
			preview.subtotal + (preview.tax?.total ?? 0),
			2,
		);
		expect(preview.total).toBeGreaterThan(preview.subtotal);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("preview-attach-tax-rate-id (inclusive 10%): preview reports amount_inclusive but keeps total === subtotal")}`,
	async () => {
		const customerId = "preview-tax-rate-inclusive";
		const proProd = products.pro({ id: "pro", items: [] });

		const { ctx, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proProd] }),
			],
			actions: [],
		});

		const taxRate = await ctx.stripeCli.taxRates.create({
			display_name: "Test Tax Inclusive",
			percentage: 10,
			inclusive: true,
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: proProd.id,
			tax_rate_id: taxRate.id,
		})) as AttachPreviewResponse;

		expect(preview.tax).toBeDefined();
		expect(preview.tax?.status).toBe("complete");
		expect(preview.tax?.currency).toBe(preview.currency);
		expect(preview.tax?.amount_inclusive).toBeGreaterThan(0);
		expect(preview.tax?.amount_exclusive).toBe(0);
		expect(preview.tax?.amount_inclusive).toBeCloseTo(
			preview.subtotal * (10 / 110),
			2,
		);

		expect(preview.tax?.total).toBe(0);
		expect(preview.total).toBeCloseTo(preview.subtotal, 2);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("preview-attach-tax-rate-id (no tax_rate_id, auto_tax off): preview omits tax field")}`,
	async () => {
		const customerId = "preview-tax-rate-omitted";
		const proProd = products.pro({ id: "pro", items: [] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proProd] }),
			],
			actions: [],
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: proProd.id,
		})) as AttachPreviewResponse;

		expect(preview.tax).toBeUndefined();
	},
	300_000,
);
