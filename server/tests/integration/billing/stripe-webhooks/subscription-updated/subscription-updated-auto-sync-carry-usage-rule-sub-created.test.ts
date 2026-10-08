// Contract: back-synced plan changes (sub.updated / sub.created auto-sync) carry consumed usage onto
// the replacement plan with the same carry semantics as attach.

import { test } from "bun:test";
import {
	createCustomBasePriceForProduct,
	createExternalStripeSubscription,
	ensureDistinctStripeProcessor,
	expectStripeSubscriptionCreated,
	getFullProduct,
	trackCustomerUsage,
	updateBaseSubscriptionItemToVariant,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	deleteLeftoverCarryPlans,
	setupConsumableFamilyOnBase,
} from "./utils/autoSyncCarryUsage";

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

// ═══════════════════════════════════════════════════════════════════════════
// 7. Free (default) -> paid via sub.created auto-sync carries free-plan usage
// ═══════════════════════════════════════════════════════════════════════════
test(`${chalk.yellowBright("sub.created auto-sync carry 7: default free usage carries onto synced paid plan")}`, async () => {
	const customerId = "sync-carry-free-to-paid";
	const group = "grp-sync-carry-free";

	const free = products.base({
		id: "sync-carry-free",
		group,
		items: [items.monthlyMessages({ includedUsage: 3_000 })],
	});
	const paid = products.base({
		id: "sync-carry-paid",
		group,
		items: [
			items.monthlyPrice({ price: 20 }),
			items.consumableMessages({ includedUsage: 50_000, price: 0.9 }),
		],
	});

	await deleteLeftoverCarryPlans(["sync-carry-free", "sync-carry-paid"]);

	const v1CustomerId = `${customerId}-v1`;
	const { autumnV1 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: v1CustomerId, paymentMethod: "success" }]),
			s.products({ list: [free, paid] }),
		],
		actions: [
			s.attach({ productId: free.id }),
			s.attach({ productId: paid.id, customerId: v1CustomerId }),
		],
	});

	await trackCustomerUsage({
		autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		value: 2_000,
	});

	const freeFull = await getFullProduct({ ctx, productId: free.id });
	const paidFull = await ensureDistinctStripeProcessor({
		ctx,
		fullProduct: await getFullProduct({ ctx, productId: paid.id }),
		otherProcessorId: freeFull.processor?.id,
	});
	const paidPrice = await createCustomBasePriceForProduct({
		ctx,
		fullProduct: paidFull,
		amount: 20,
	});
	const subscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: paidPrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription });

	const customer = await waitForCustomerProducts({
		label: "after-sub-created",
		autumnV1,
		customerId,
		active: [paid.id],
		notPresent: [free.id],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 50_000,
		balance: 48_000,
		usage: 2_000,
	});
});
