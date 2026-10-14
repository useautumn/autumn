import { expect, test } from "bun:test";
import { type ApiCustomerV3, CustomerExpand } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli";
import { CusService } from "@/internal/customers/CusService.js";
import { timeout } from "@/utils/genUtils.js";

const billingUnits = 12;

const expectQuantityAppliedOnFinalize = async ({
	autumnV1,
	customerId,
	stripeInvoiceId,
	balanceBefore,
}: {
	autumnV1: AutumnInt;
	customerId: string;
	stripeInvoiceId: string;
	balanceBefore: number;
}) => {
	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(stripeInvoiceId);
	expect(stripeInvoice.status).toBe("draft");

	const pending = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(pending.features?.[TestFeature.Messages]?.balance).toBe(
		balanceBefore,
	);

	await ctx.stripeCli.invoices.finalizeInvoice(stripeInvoiceId);

	await expectCustomerFeatureCorrect({
		autumn: autumnV1,
		customerId,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		featureId: TestFeature.Messages,
		balance: balanceBefore + 60,
	});
};

test.concurrent(`${chalk.yellowBright("update-quantity: default invoice mode (draft, immediate entitlements)")}`, async () => {
	const customerId = "inv-mode-default";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
		],
	});

	const beforeUpdate = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const customerProduct = beforeUpdate.customer_products.find(
		(cp) => cp.product.id === product.id,
	);
	const beforeEntitlement = customerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const beforeBalance = beforeEntitlement?.balance || 0;

	const result = await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 15 * billingUnits },
		],
		invoice: true,
		enable_product_immediately: true,
		finalize_invoice: false,
	});

	await expectQuantityAppliedOnFinalize({
		autumnV1,
		customerId,
		stripeInvoiceId: result.invoice!.stripe_id,
		balanceBefore: beforeBalance,
	});

	const afterUpdate = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		expand: [CustomerExpand.Invoices],
	});

	const afterCustomerProduct = afterUpdate.customer_products.find(
		(cp) => cp.product.id === product.id,
	);
	const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const afterBalance = afterEntitlement?.balance || 0;

	expect(afterBalance).toBe(beforeBalance + 60);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const feature = customer.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(180);
});

test.concurrent(`${chalk.yellowBright("update-quantity: draft invoice with immediate entitlements (explicit)")}`, async () => {
	const customerId = "inv-mode-draft-explicit";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
		],
	});

	const beforeUpdate = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const customerProduct = beforeUpdate.customer_products.find(
		(cp) => cp.product.id === product.id,
	);
	const beforeEntitlement = customerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const beforeBalance = beforeEntitlement?.balance || 0;

	const result = await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 15 * billingUnits },
		],
		invoice: true,
		finalize_invoice: false,
		enable_product_immediately: true,
	});

	await expectQuantityAppliedOnFinalize({
		autumnV1,
		customerId,
		stripeInvoiceId: result.invoice!.stripe_id,
		balanceBefore: beforeBalance,
	});

	const afterUpdate = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const afterCustomerProduct = afterUpdate.customer_products.find(
		(cp) => cp.product.id === product.id,
	);
	const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const afterBalance = afterEntitlement?.balance || 0;

	expect(afterBalance).toBe(beforeBalance + 60);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const feature = customer.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(180);
});

test.concurrent(`${chalk.yellowBright("update-quantity: finalized invoice with immediate entitlements")}`, async () => {
	const customerId = "inv-mode-finalized";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
		],
	});

	const beforeUpdate = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const customerProduct = beforeUpdate.customer_products.find(
		(cp) => cp.product.id === product.id,
	);
	const beforeEntitlement = customerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const beforeBalance = beforeEntitlement?.balance || 0;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: true,
	});

	const afterUpdate = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const afterCustomerProduct = afterUpdate.customer_products.find(
		(cp) => cp.product.id === product.id,
	);
	const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const afterBalance = afterEntitlement?.balance || 0;

	expect(afterBalance).toBe(beforeBalance + 120);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const feature = customer.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(240);

	const paidInvoice = customer.invoices?.find((inv) => inv.status === "paid");
	expect(paidInvoice).toBeDefined();
});

test.concurrent(`${chalk.yellowBright("update-quantity: entitlements after payment via checkout")}`, async () => {
	const customerId = "inv-mode-payment-required";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
			}),
		],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
		],
	});

	const beforeUpdate = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const customerProduct = beforeUpdate.customer_products.find(
		(cp) => cp.product.id === product.id,
	);
	const beforeEntitlement = customerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const beforeBalance = beforeEntitlement?.balance || 0;

	const result = await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 25 * billingUnits },
		],
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: false,
	});

	const afterUpdate = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const afterCustomerProduct = afterUpdate.customer_products.find(
		(cp) => cp.product.id === product.id,
	);
	const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const afterBalance = afterEntitlement?.balance || 0;

	expect(afterBalance).toBe(beforeBalance);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const feature = customer.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(120);

	const openInvoice = customer.invoices?.find((inv) => inv.status === "open");
	expect(openInvoice).toBeDefined();
	expect(openInvoice?.hosted_invoice_url).toBeDefined();

	await completeInvoiceCheckout({
		url: result.payment_url!,
		ctx,
		customerId,
	});

	await timeout(10000);

	const afterPayment = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const paidCustomerProduct = afterPayment.customer_products.find(
		(cp) => cp.product.id === product.id,
	);
	const paidEntitlement = paidCustomerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const paidBalance = paidEntitlement?.balance || 0;

	expect(paidBalance).toBe(beforeBalance + 180);

	const customerAfterPayment =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const featureAfterPayment =
		customerAfterPayment.features?.[TestFeature.Messages];
	expect(featureAfterPayment?.balance).toBe(300);
	const unpaidInvoices = customerAfterPayment.invoices?.filter(
		(inv) => inv.status !== "paid",
	);
	expect(unpaidInvoices?.length ?? 0).toBe(0);
});
