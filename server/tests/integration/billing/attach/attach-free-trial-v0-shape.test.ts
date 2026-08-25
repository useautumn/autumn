/**
 * TDD test for the free trial silently vanishing from an attach.
 *
 * The MCP `attach` tool exposes AttachParamsV1Schema, which expresses a trial
 * as `customize.free_trial`. Every agent-facing doc (trials.md, the Plan
 * concept) documents the V0 shape — a top-level `free_trial` — so the model
 * sends that, V1 has no such field, and the trial is dropped without an error.
 * The customer is charged immediately and the approval card shows no trial.
 *
 * Red-failure mode (current behavior):
 *  - Attaching with a top-level `free_trial` produces a subscription with no
 *    trial: the preview charges the full base price now.
 *
 * Green-success criteria (after fix):
 *  - A top-level `free_trial` is accepted on V1 and maps into
 *    customize.free_trial, matching `customize.free_trial` exactly.
 */

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
		const scale = products.pro({
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

		// The shape every agent doc tells the model to send.
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

		// The shape the V1 schema actually defines.
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

		const dueNow = (preview: unknown) =>
			(preview as { total?: number } | undefined)?.total ?? 0;

		// A trialling attach charges nothing today; both shapes must agree.
		expect(dueNow(v1Shape)).toBe(0);
		expect(dueNow(v0Shape)).toBe(dueNow(v1Shape));
	},
);
