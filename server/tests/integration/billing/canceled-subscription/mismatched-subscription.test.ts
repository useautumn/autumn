/**
 * A customer product can end up linked to a Stripe subscription that belongs to
 * a *different* Stripe customer. That is a data fault worth surfacing on most
 * operations — but it must not strand the plan: an immediate cancel only
 * detaches Autumn-side state and never touches the foreign subscription.
 *
 * Contract under test:
 *   New types/fields:
 *     - BillingContext.mismatchedStripeSubscriptionId?: string
 *   New behaviors:
 *     - cancel_immediately on a foreign-linked sub
 *         -> succeeds, plan expires, default activates, no charge
 *     - the foreign subscription and its owner are left completely untouched
 *     - any other update still rejects with "is not for the current customer"
 *
 * Pre-fix red: `fetchStripeSubscriptionForBilling` threw unconditionally on the
 * ownership check, so even the cancel — and the dashboard pricing preview that
 * precedes it — 400'd with no way out of the state.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { findActiveCustomerProductById } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

const OWNER_KEY = "mismatched-sub-owner";

/**
 * Points the subject's active customer product at a subscription owned by a
 * different Stripe customer, reproducing the linkage fault.
 */
const setupForeignSubscriptionLink = async ({
	customerId,
	productId,
}: {
	customerId: string;
	productId: string;
}) => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: productId, items: [messagesItem] });

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: OWNER_KEY, paymentMethod: "success" }]),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: pro.id, customerId: OWNER_KEY }),
		],
	});

	const { ctx, otherCustomers } = scenario;
	const ownerId = otherCustomers.get(OWNER_KEY)?.id;
	if (!ownerId) throw new Error("owner customer not created");

	const foreignSubscriptionId = await getSubscriptionId({
		ctx,
		customerId: ownerId,
		productId: pro.id,
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId: pro.id,
	});
	if (!customerProduct) throw new Error("subject customer product missing");

	await CusProductService.update({
		ctx,
		cusProductId: customerProduct.id,
		updates: { subscription_ids: [foreignSubscriptionId] },
	});

	return { ...scenario, free, pro, ownerId, foreignSubscriptionId };
};

// ═══════════════════════════════════════════════════════════════════════════
// Immediate cancel is the way out of the state
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("mismatched sub: cancel_immediately succeeds and leaves the foreign sub alone")}`, async () => {
	const customerId = "mismatched-sub-cancel-now";

	const { autumnV1, autumnV2_2, ctx, free, pro, foreignSubscriptionId } =
		await setupForeignSubscriptionLink({ customerId, productId: "pro" });

	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
			?.length ?? 0;

	// ── Contract assertion 1: the preview no longer 400s ──────────────────────
	await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
		{
			customer_id: customerId,
			plan_id: pro.id,
			cancel_action: "cancel_immediately",
		},
	);

	// ── Contract assertion 2: the cancel itself goes through ─────────────────
	await autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		cancel_action: "cancel_immediately",
	});

	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		notPresent: [pro.id],
		active: [free.id],
	});

	// ── Contract assertion 3: no charge or credit on the subject ─────────────
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});

	// ── Contract assertion 4: the foreign subscription is untouched ──────────
	const foreignSubscription = await ctx.stripeCli.subscriptions.retrieve(
		foreignSubscriptionId,
	);
	expect(foreignSubscription.status).toBe("active");
	expect(foreignSubscription.cancel_at_period_end).toBe(false);
	expect(foreignSubscription.canceled_at).toBeNull();
});

// ═══════════════════════════════════════════════════════════════════════════
// Everything else still surfaces the fault
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("mismatched sub: a non-cancel update still rejects")}`, async () => {
	const customerId = "mismatched-sub-other-update";

	const { autumnV2_2, pro, foreignSubscriptionId } =
		await setupForeignSubscriptionLink({ customerId, productId: "pro" });

	await expectAutumnError({
		errMessage: `Subscription ${foreignSubscriptionId} is not for the current customer`,
		func: () =>
			autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			}),
	});
});
