/**
 * catalogV2.update — a rejected request leaves the catalog untouched.
 *
 * executeUpdateCatalogPlan is a straight sequence of independent,
 * non-transactional writes (rename -> features -> products -> remove ->
 * revenuecat -> init_stripe), and it cannot be wrapped in a transaction because
 * it calls Stripe. Two validators used to throw 400 from the tail of that
 * sequence, after earlier writes had already committed:
 *
 *   - assertRevenueCatIdsUnclaimed, inside executeRevenueCatMappings
 *   - validateAdoptedStripePrices, from initStripeResourcesForCatalog
 *
 * The Stripe one is worse than a partial write. `newlyAdoptedPrices` decides
 * what to validate by diffing against the CURRENT row, so once a failed attempt
 * has persisted the bad price id, the retry reads it as already-known, skips the
 * Stripe lookup entirely and SUCCEEDS on an id that does not exist.
 *
 * Contract:
 *   V1  a rename that also claims another plan's RevenueCat id is rejected with
 *       the rename NOT applied
 *   V2  a rename that also states a nonexistent Stripe price id is rejected
 *       with the rename NOT applied
 *   V3  retrying V2 verbatim is rejected again — the first attempt persisted
 *       nothing for the diff to wave through
 *
 * Red (before): V1/V2 reject but the plan has already moved to its new id, and
 *   V3 succeeds, leaving a price pointing at a Stripe id that does not exist.
 * Green (after): both checks run ahead of execute.rename_plans, so all three
 *   requests reject and the catalog is unchanged.
 */

import { expect, test } from "bun:test";
import { BillingInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	messagesItem,
	withCatalogPlans,
} from "../licenses/utils/seedLicensePlans.js";

const MISSING_STRIPE_PRICE_ID = "price_ThisStripePriceDoesNotExist";

const planIds = async ({
	autumn,
}: {
	autumn: AutumnInt;
}): Promise<string[]> => {
	const catalog = await autumn.catalogV2.get({});
	return catalog.plans.map((plan: { id: string }) => plan.id);
};

const expectRenameNotApplied = async ({
	autumn,
	fromId,
	toId,
}: {
	autumn: AutumnInt;
	fromId: string;
	toId: string;
}) => {
	const ids = await planIds({ autumn });
	expect(ids, `${fromId} still exists under its own id`).toContain(fromId);
	expect(ids, `${toId} was never created`).not.toContain(toId);
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 validate-first: a rejected revenuecat claim rolls no rename forward")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const ownerId = uniqueTestId("cv2_vbw_owner");
		const moverId = uniqueTestId("cv2_vbw_mover");
		const renamedId = uniqueTestId("cv2_vbw_renamed");
		const sharedId = `rc_${ownerId}_shared`;

		await withCatalogPlans({
			ctx,
			planIds: [ownerId, moverId, renamedId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: ownerId,
							name: "RC Owner",
							items: [{ feature_id: TestFeature.Messages, included: 0 }],
							processors: {
								revenuecat: { products: [{ product_id: sharedId }] },
							},
						},
						{
							plan_id: moverId,
							name: "RC Mover",
							items: [messagesItem(100)],
						},
					],
				});

				// V1: one request, two effects — the rename must not outlive the 400.
				await expect(
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: moverId,
								new_plan_id: renamedId,
								processors: {
									revenuecat: { products: [{ product_id: sharedId }] },
								},
							},
						],
					}),
				).rejects.toThrow();

				await expectRenameNotApplied({
					autumn: autumnV2_3,
					fromId: moverId,
					toId: renamedId,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 validate-first: a nonexistent stripe price id rejects, and the retry rejects too")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vbw_price");
		const renamedId = uniqueTestId("cv2_vbw_price_renamed");

		await withCatalogPlans({
			ctx,
			planIds: [planId, renamedId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Bad Price Adopt",
							price: { amount: 20, interval: BillingInterval.Month },
							items: [messagesItem(100)],
						},
					],
				});

				const badRequest = () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								new_plan_id: renamedId,
								price: {
									amount: 20,
									interval: BillingInterval.Month,
									processors: {
										stripe: { price_id: MISSING_STRIPE_PRICE_ID },
									},
								},
							},
						],
					});

				// V2: rejected, and the rename it rode with never landed.
				await expect(badRequest()).rejects.toThrow();
				await expectRenameNotApplied({
					autumn: autumnV2_3,
					fromId: planId,
					toId: renamedId,
				});

				// V3: the retry must not be waved through as "already known".
				await expect(badRequest()).rejects.toThrow();
				await expectRenameNotApplied({
					autumn: autumnV2_3,
					fromId: planId,
					toId: renamedId,
				});
			},
		});
	},
);
