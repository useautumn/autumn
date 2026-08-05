/**
 * TDD contract: back-synced plan changes (customer.subscription.updated /
 * customer.subscription.created auto-sync) carry consumed usage onto the
 * replacement plan using the same carry semantics as attach.
 *
 * Slice 2/2: the ORG-CONFIG case. This test patches the org's transition rules
 * (carry_over_usages.enabled = false) for the length of its run, so it is
 * deliberately NOT `test.concurrent` and must not share a file — or a
 * parallel-group org — with any carry-sensitive test:
 *   6. org transition rule { enabled: false } -> consumables NOT carried on sync
 *
 * 6 documents the rule inheritance wiring for sync.
 */

import { test } from "bun:test";
import {
	createCustomBasePriceForProduct,
	createExternalStripeSubscription,
	expectStripeSubscriptionCreated,
	getFullProductFromMap,
	setupSharedStripeFamilies,
	trackCustomerUsage,
	updateBaseSubscriptionItemToVariant,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

/** Base(consumable messages) + one variant, external sub on the base. */
const setupConsumableFamilyOnBase = async ({
	customerId,
	baseId,
	baseIncluded,
	variantId,
	variantIncluded,
	variantAmount,
}: {
	customerId: string;
	baseId: string;
	baseIncluded: number;
	variantId: string;
	variantIncluded: number;
	variantAmount: number;
}) => {
	const {
		autumnV1,
		ctx: testCtx,
		fullProducts,
	} = await setupSharedStripeFamilies({
		customerId,
		families: [
			{
				baseId,
				group: `grp-${baseId}`,
				baseAmount: 20,
				featureId: TestFeature.Messages,
				baseIncluded,
				variants: [
					{ id: variantId, amount: variantAmount, included: variantIncluded },
				],
			},
		],
	});
	const baseFull = getFullProductFromMap({ fullProducts, productId: baseId });
	const variantFull = getFullProductFromMap({
		fullProducts,
		productId: variantId,
	});

	const basePrice = await createCustomBasePriceForProduct({
		ctx: testCtx,
		fullProduct: baseFull,
		amount: 20,
	});
	const subscription = await createExternalStripeSubscription({
		ctx: testCtx,
		customerId,
		items: [{ price: basePrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription });

	await waitForCustomerProducts({
		label: "initial-sync",
		autumnV1,
		customerId,
		active: [baseId],
		notPresent: [variantId],
	});

	return { autumnV1, ctx: testCtx, baseFull, variantFull, subscription };
};

// ═══════════════════════════════════════════════════════════════════════════
// 6. Org transition rule { enabled: false }: consumables NOT carried on sync
// ═══════════════════════════════════════════════════════════════════════════
test(`${chalk.yellowBright("sub.updated auto-sync carry 6: org rule enabled=false skips consumable carry")}`, async () => {
	const customerId = "sync-carry-rule-off";
	const baseId = "sync-carry-rule-base";
	const variantId = "sync-carry-rule-100k";

	const {
		autumnV1,
		ctx: testCtx,
		baseFull,
		variantFull,
		subscription,
	} = await setupConsumableFamilyOnBase({
		customerId,
		baseId,
		baseIncluded: 50_000,
		variantId,
		variantIncluded: 100_000,
		variantAmount: 35,
	});

	const orgClient = new AutumnInt({ secretKey: testCtx.orgSecretKey });
	try {
		await trackCustomerUsage({
			autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			value: 30_000,
		});

		await orgClient.patch("/organization/transition_rules", {
			carry_over_usages: { enabled: false },
		});

		await updateBaseSubscriptionItemToVariant({
			ctx: testCtx,
			subscription,
			fromFullProduct: baseFull,
			toFullProduct: variantFull,
			toAmount: 35,
		});

		const customer = await waitForCustomerProducts({
			label: "after-upgrade",
			autumnV1,
			customerId,
			active: [variantId],
			notPresent: [baseId],
		});
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100_000,
			balance: 100_000,
			usage: 0,
		});
	} finally {
		await orgClient
			.patch("/organization/transition_rules", { carry_over_usages: null })
			.catch(() => undefined);
	}
});
