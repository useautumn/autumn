import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	CusProductStatus,
	type FullCusProduct,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";
import {
	getLongLivedCheckoutId,
	getStripeSessionId,
	requestLongLivedCheckoutStart,
	startLongLivedCheckout,
} from "../checkout/stripe-checkout/utils/longLivedCheckoutUtils";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

const listPending = ({
	ctx,
	internalCustomerId,
}: {
	ctx: ScenarioCtx;
	internalCustomerId: string;
}) =>
	CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Pending],
	});

const getOnlyPending = async (params: {
	ctx: ScenarioCtx;
	internalCustomerId: string;
}): Promise<FullCusProduct> => {
	const pending = await listPending(params);
	expect(pending).toHaveLength(1);
	return pending[0];
};

test.concurrent(
	`${chalk.yellowBright("reattach pending: a draft-invoice pending plan is replaced by a new invoice")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_2, ctx, customer, customerId } = await initScenario({
			customerId: "reattach-pending-draft",
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: false,
				}),
			],
		});
		const internalCustomerId = customer!.internal_id;
		const draftPending = await getOnlyPending({ ctx, internalCustomerId });
		const draftMetadata = await MetadataService.get({
			db: ctx.db,
			id: draftPending.metadata_id!,
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			invoice_mode: { enabled: true, finalize: true },
		});
		expect(result.invoice?.status).toBe("open");
		expect(result.invoice?.stripe_id).not.toBe(
			draftMetadata!.stripe_invoice_id,
		);

		const pending = await getOnlyPending({ ctx, internalCustomerId });
		expect(pending.id).not.toBe(draftPending.id);
		const draftInvoice = await ctx.stripeCli.invoices.retrieve(
			draftMetadata!.stripe_invoice_id!,
		);
		const draftSubscription = await ctx.stripeCli.subscriptions.retrieve(
			stripeInvoiceToStripeSubscriptionId(draftInvoice)!,
		);
		expect(draftSubscription.status).toBe("canceled");
	},
);

test.concurrent(
	`${chalk.yellowBright("reattach pending: a long-lived pending plan is replaced and its old link expires")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_2, ctx, customer, customerId } = await initScenario({
			customerId: "reattach-pending-long-lived",
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});
		const internalCustomerId = customer!.internal_id;

		const first = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			long_lived_checkout: true,
		});
		const firstCheckoutId = getLongLivedCheckoutId(first.payment_url);
		const firstSessionId = getStripeSessionId(
			await startLongLivedCheckout(firstCheckoutId),
		);
		const firstPending = await getOnlyPending({ ctx, internalCustomerId });

		const second = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			long_lived_checkout: true,
		});
		expect(second.payment_url).not.toBe(first.payment_url);

		const pending = await getOnlyPending({ ctx, internalCustomerId });
		expect(pending.id).not.toBe(firstPending.id);

		const firstSession =
			await ctx.stripeCli.checkout.sessions.retrieve(firstSessionId);
		expect(firstSession.status).toBe("expired");

		const reopenFirst = await requestLongLivedCheckoutStart(firstCheckoutId);
		expect(reopenFirst.status).toBe(410);
		await startLongLivedCheckout(getLongLivedCheckoutId(second.payment_url));
	},
);
