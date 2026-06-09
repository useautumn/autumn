/**
 * Regression: pre-side-effect 4xx track failures must not burn the global Idempotency-Key.
 * Before this, retrying returned duplicate_idempotency_key instead of the original 4xx.
 */

import { expect, test } from "bun:test";

import { ErrCode } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("track-global-idempotency-4xx: retries return original 4xx")}`,
	async () => {
		const { autumnV1, customerId } = await initScenario({
			customerId: "track-global-idempotency-4xx",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const idempotencyKey = `track-global-idempotency-4xx-${Date.now().toString(36)}`;
		const trackMissingEntity = async () =>
			autumnV1.post(
				"/track",
				{
					customer_id: customerId,
					entity_id: `${customerId}-missing-entity`,
					event_name: "messages",
					value: 1,
				},
				{ "Idempotency-Key": idempotencyKey },
			);

		const getErrorCode = async () => {
			try {
				await trackMissingEntity();
			} catch (error) {
				if (error && typeof error === "object" && "code" in error) {
					return String(error.code);
				}

				throw error;
			}

			throw new Error("Expected track to fail");
		};

		const firstCode = await getErrorCode();
		expect(firstCode).not.toBe(ErrCode.DuplicateIdempotencyKey);
		expect(await getErrorCode()).toBe(firstCode);
	},
);
