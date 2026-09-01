/**
 * catalogV2.update — an explicit Stripe unlink survives its own request on a
 * PAID plan.
 *
 * `applyPlanProcessorsToProduct` clears `product.processor`, but a paid plan
 * with no processor id reads as "missing Stripe resources"
 * (hasMissingStripeResourcesForProduct), so the execute-phase init used to mint
 * a REPLACEMENT Stripe product on the very same request. The plan came back
 * mapped to a product the caller never asked for.
 *
 * The sibling file product-id-unlink.test.ts covers the same clear on a FREE
 * fixture, where `isFreeProduct` short-circuits the completeness check and the
 * bug cannot fire. This one carries a base price so it does.
 *
 * Contract:
 *   P1  a paid plan is left with NO Stripe product after an unlink — attach
 *       mints one lazily (attachRouter -> createStripePriceIFNotExist), so the
 *       plan is re-created under Stripe the next time it is sold
 *   P2  the fan-out rows obey it too: version siblings (processor_sync) and
 *       variants (variant_propagation) each restate `{ stripe: null }` on their
 *       own row and must not be re-minted either
 *
 * Red (before): every asserted row comes back holding a freshly minted
 *   `prod_...` id instead of null.
 * Green (after): every row's processor is null.
 */

import { expect, test } from "bun:test";
import { BillingInterval } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	messagesItem,
	withCatalogPlans,
} from "../licenses/utils/seedLicensePlans.js";
import { expectVersionProcessorCorrect } from "./utils/expectPlanProcessors.js";

const BASE_AMOUNT = 20;

const paidPrice = { amount: BASE_AMOUNT, interval: BillingInterval.Month };

/** Autumn minted this when the paid plan was created — the id an unlink drops. */
const mintedProcessorId = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}) => {
	const product = await ProductService.get({
		db: ctx.db,
		id: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		...(version !== undefined ? { version } : {}),
	});
	const processorId = product?.processor?.id ?? null;
	expect(
		processorId,
		`${planId} starts mapped to a Stripe product`,
	).toBeTruthy();
	return processorId;
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors unlink: a paid plan is not re-minted after an unlink")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_proc_unlink_paid");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Unlink Paid",
							price: paidPrice,
							items: [messagesItem(100)],
						},
					],
				});
				const minted = await mintedProcessorId({ ctx, planId });

				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, processors: { stripe: null } }],
				});

				// P1: cleared, and NOT swapped for a replacement product.
				await expectVersionProcessorCorrect({
					ctx,
					planId,
					version: 1,
					productId: null,
				});
				const after = await ProductService.get({
					db: ctx.db,
					id: planId,
					orgId: ctx.org.id,
					env: ctx.env,
				});
				expect(
					after?.processor?.id ?? null,
					`${planId} must not be re-minted (was ${minted})`,
				).toBeNull();
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors unlink: paid version siblings and variants are not re-minted")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_proc_unlink_paid_fan");
		const variantId = uniqueTestId("cv2_proc_unlink_paid_eu");

		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							name: "Unlink Paid Base",
							price: paidPrice,
							items: [messagesItem(100)],
							variants: [
								{ variant_plan_id: variantId, name: "Unlink Paid EU" },
							],
						},
					],
				});
				// A second version so the processor_sync fan-out lane has a sibling.
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: baseId, versioning: "new_version", active: true }],
				});
				await mintedProcessorId({ ctx, planId: baseId, version: 1 });
				await mintedProcessorId({ ctx, planId: variantId, version: 1 });

				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: baseId, processors: { stripe: null } }],
				});

				// P2: the addressed row, its history, and the variant all stay bare.
				for (const row of [
					{ planId: baseId, version: 2 },
					{ planId: baseId, version: 1 },
					{ planId: variantId, version: 1 },
				]) {
					await expectVersionProcessorCorrect({
						ctx,
						planId: row.planId,
						version: row.version,
						productId: null,
					});
				}
			},
		});
	},
);
