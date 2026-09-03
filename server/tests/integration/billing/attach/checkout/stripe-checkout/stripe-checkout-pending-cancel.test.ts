/**
 * TDD test: cancelling a plan that is pending on a Stripe checkout session must
 * expire that session at Stripe and let the customer start a fresh checkout.
 *
 * Red-failure mode (current behavior):
 *  - the checkout session stays "open" at Stripe after the pending plan is
 *    cancelled, and/or a re-attach hands back the stale checkout URL.
 *
 * Green-success criteria (after fix):
 *  - session.status === "expired", the pending row is expired, the metadata
 *    row is gone, and a re-attach returns a new open checkout session.
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type AttachParamsV1Input,
	CusProductStatus,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

type ScenarioContext = Awaited<ReturnType<typeof initScenario>>["ctx"];

const findPendingRow = async ({
	ctx,
	internalCustomerId,
	productId,
}: {
	ctx: ScenarioContext;
	internalCustomerId: string;
	productId: string;
}) => {
	const customerProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: ALL_STATUSES,
	});

	return customerProducts.find(
		(customerProduct) => customerProduct.product.id === productId,
	);
};

const startPendingCheckout = async ({
	customerId,
	productId,
}: {
	customerId: string;
	productId: string;
}) => {
	const pro = products.pro({
		id: productId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
		actions: [],
	});

	const { ctx, autumnV2_2, customer } = scenario;

	const attachResult = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
	});

	expect(attachResult.payment_url).toContain("checkout.stripe.com");

	const pendingRow = await findPendingRow({
		ctx,
		internalCustomerId: customer?.internal_id ?? "",
		productId: pro.id,
	});

	expect(pendingRow?.status).toBe(CusProductStatus.Pending);

	const metadataId = pendingRow?.metadata_id ?? "";
	const metadata = await MetadataService.get({ db: ctx.db, id: metadataId });
	const checkoutSessionId = metadata?.stripe_checkout_session_id ?? "";

	expect(checkoutSessionId).toStartWith("cs_");

	const openSession =
		await ctx.stripeCli.checkout.sessions.retrieve(checkoutSessionId);
	expect(openSession.status).toBe("open");

	return {
		...scenario,
		pro,
		metadataId,
		checkoutSessionId,
		originalPaymentUrl: attachResult.payment_url as string,
	};
};

const expectPendingCheckoutDiscarded = async ({
	ctx,
	internalCustomerId,
	productId,
	metadataId,
	checkoutSessionId,
}: {
	ctx: ScenarioContext;
	internalCustomerId: string;
	productId: string;
	metadataId: string;
	checkoutSessionId: string;
}) => {
	const session =
		await ctx.stripeCli.checkout.sessions.retrieve(checkoutSessionId);
	expect(session.status).toBe("expired");

	const row = await findPendingRow({ ctx, internalCustomerId, productId });
	expect(row?.status).toBe(CusProductStatus.Expired);
	expect(row?.metadata_id).toBeNull();

	const remainingMetadata = await MetadataService.get({
		db: ctx.db,
		id: metadataId,
	});
	expect(remainingMetadata).toBeNull();
};

test.concurrent(
	`${chalk.yellowBright("stripe-checkout pending cancel: /cancel expires the open checkout session")}`,
	async () => {
		const customerId = `checkout-pending-cancel-v1-${Date.now()}`;
		const { ctx, autumnV1, customer, pro, metadataId, checkoutSessionId } =
			await startPendingCheckout({
				customerId,
				productId: "pro-checkout-pending-cancel-v1",
			});

		await autumnV1.cancel({ customer_id: customerId, product_id: pro.id });

		await expectPendingCheckoutDiscarded({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
			productId: pro.id,
			metadataId,
			checkoutSessionId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("stripe-checkout pending cancel: billing.update cancel_action expires the open checkout session")}`,
	async () => {
		const customerId = `checkout-pending-cancel-update-${Date.now()}`;
		const { ctx, autumnV2_2, customer, pro, metadataId, checkoutSessionId } =
			await startPendingCheckout({
				customerId,
				productId: "pro-checkout-pending-cancel-update",
			});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		await expectPendingCheckoutDiscarded({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
			productId: pro.id,
			metadataId,
			checkoutSessionId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("stripe-checkout pending cancel: re-attaching after cancel opens a fresh checkout session")}`,
	async () => {
		const customerId = `checkout-pending-cancel-reattach-${Date.now()}`;
		const {
			ctx,
			autumnV1,
			autumnV2_2,
			customer,
			pro,
			checkoutSessionId,
			originalPaymentUrl,
		} = await startPendingCheckout({
			customerId,
			productId: "pro-checkout-pending-cancel-reattach",
		});

		await autumnV1.cancel({ customer_id: customerId, product_id: pro.id });

		const reattachResult = await autumnV2_2.billing.attach<AttachParamsV1Input>(
			{
				customer_id: customerId,
				plan_id: pro.id,
			},
		);

		expect(reattachResult.payment_url).toContain("checkout.stripe.com");
		expect(reattachResult.payment_url).not.toBe(originalPaymentUrl);

		const customerProducts = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer?.internal_id ?? "",
			inStatuses: [CusProductStatus.Pending],
		});
		const freshRow = customerProducts.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);
		const freshMetadata = await MetadataService.get({
			db: ctx.db,
			id: freshRow?.metadata_id ?? "",
		});
		const freshSessionId = freshMetadata?.stripe_checkout_session_id ?? "";

		expect(freshSessionId).toStartWith("cs_");
		expect(freshSessionId).not.toBe(checkoutSessionId);

		const freshSession =
			await ctx.stripeCli.checkout.sessions.retrieve(freshSessionId);
		expect(freshSession.status).toBe("open");
	},
);
