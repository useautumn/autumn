/**
 * Body-level (`body.idempotency_key`) track idempotency.
 *
 * Contract under test:
 *   - A successful track keeps the body key → an identical retry gets 409
 *     duplicate_idempotency_key.
 *   - A pre-side-effect 4xx releases the body key → the retry re-runs and
 *     returns the original error, not 409.
 *   - The header and body keys are independent claims: after a successful
 *     track with both, reusing EITHER one alone gets 409.
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("body idempotency: successful track keeps the key, retry gets 409")}`,
	async () => {
		const freeProd = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 20 })],
		});

		const { autumnV2_3, customerId } = await initScenario({
			customerId: "track-body-idem-success",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const bodyKey = `body-idem-${Date.now().toString(36)}`;
		const track = () =>
			autumnV2_3.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
				idempotency_key: bodyKey,
			});

		await track();

		await expectAutumnError({
			errCode: ErrCode.DuplicateIdempotencyKey,
			func: track,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("body idempotency: pre-side-effect 4xx releases the key, retry returns the original error")}`,
	async () => {
		const { autumnV2_3, customerId } = await initScenario({
			customerId: "track-body-idem-4xx",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const bodyKey = `body-idem-4xx-${Date.now().toString(36)}`;
		const trackMissingEntity = () =>
			autumnV2_3.track({
				customer_id: customerId,
				entity_id: `${customerId}-missing-entity`,
				event_name: "messages",
				value: 1,
				idempotency_key: bodyKey,
			});

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

test.concurrent(
	`${chalk.yellowBright("body + header idempotency: the two keys are independent claims")}`,
	async () => {
		const freeProd = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 20 })],
		});

		const { autumnV2_3, customerId } = await initScenario({
			customerId: "track-body-idem-combo",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const suffix = Date.now().toString(36);
		const headerKey = `combo-header-${suffix}`;
		const bodyKey = `combo-body-${suffix}`;
		const track = ({ header, body }: { header: string; body: string }) =>
			autumnV2_3.track(
				{
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
					idempotency_key: body,
				},
				{ headers: { "Idempotency-Key": header } },
			);

		await track({ header: headerKey, body: bodyKey });

		// Same header, fresh body key → the header claim rejects.
		await expectAutumnError({
			errCode: ErrCode.DuplicateIdempotencyKey,
			func: () => track({ header: headerKey, body: `${bodyKey}-fresh` }),
		});

		// Fresh header, same body key → the body claim rejects.
		await expectAutumnError({
			errCode: ErrCode.DuplicateIdempotencyKey,
			func: () => track({ header: `${headerKey}-fresh`, body: bodyKey }),
		});
	},
);
