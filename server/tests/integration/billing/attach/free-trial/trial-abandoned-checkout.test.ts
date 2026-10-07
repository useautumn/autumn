/**
 * Abandoned Trial Checkout Tests (Attach V2)
 *
 * A trial is only "used" once its checkout completes. Before the fix, the
 * pending row a trial checkout inserts counted toward `trials_used` and trial
 * eligibility, and kept counting after the checkout expired or was replaced,
 * so the next attach of that plan billed immediately with no trial.
 *
 * Key behaviors:
 * - An open trial checkout does not consume the trial
 * - A trial checkout replaced by another plan's checkout does not consume it
 * - A trial checkout that expires in Stripe does not consume it
 * - A completed trial checkout still consumes it
 * - With unique_fingerprint, an open checkout reserves the trial for the fingerprint
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type AttachParamsV1Input,
	CusProductStatus,
} from "@autumn/shared";
import { expectTrialsUsedCorrect } from "@tests/integration/billing/utils/expectTrialsUsedCorrect";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import {
	WEBHOOK_SETTLE_TIMEOUT_MS,
	WEBHOOK_TEST_TIMEOUT_MS,
} from "@tests/utils/pollableCustomerExpect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

type ScenarioContext = Awaited<ReturnType<typeof initScenario>>["ctx"];

const proWithCardTrial = ({ id }: { id: string }) =>
	products.proWithTrial({
		id,
		items: [items.monthlyMessages({ includedUsage: 500 })],
		trialDays: 7,
		cardRequired: true,
	});

const checkoutSessionIdFromUrl = ({ url }: { url: string }) => {
	const match = url.match(/cs_(test|live)_[A-Za-z0-9]+/);
	if (!match) throw new Error(`No checkout session id in ${url}`);
	return match[0];
};

const expectCustomerProductStatus = async ({
	ctx,
	internalCustomerId,
	productId,
	status,
}: {
	ctx: ScenarioContext;
	internalCustomerId: string;
	productId: string;
	status: CusProductStatus;
}) =>
	await pollUntilAsserted({
		fetch: () =>
			CusProductService.list({
				db: ctx.db,
				internalCustomerId,
				inStatuses: ALL_STATUSES,
			}),
		assert: (customerProducts) => {
			const customerProduct = customerProducts.find(
				(cusProduct) => cusProduct.product.id === productId,
			);
			expect(customerProduct?.status).toBe(status);
		},
		timeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
	});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Open trial checkout
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("trial-abandoned-checkout 1: open trial checkout does not consume the trial")}`,
	async () => {
		const customerId = `trial-abandoned-open-${Date.now()}`;
		const proTrial = proWithCardTrial({ id: "pro-trial-open" });

		const { ctx, autumnV2_4, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proTrial] }),
			],
			actions: [],
		});

		const result = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: proTrial.id,
			redirect_mode: "always",
		});
		expect(result.payment_url).toContain("checkout.stripe.com");

		await expectCustomerProductStatus({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
			productId: proTrial.id,
			status: CusProductStatus.Pending,
		});

		await expectTrialsUsedCorrect({
			customerId,
			autumn: autumnV2_4,
			planIds: [],
		});

		const preview = await autumnV2_4.billing.previewAttach<AttachParamsV1Input>(
			{ customer_id: customerId, plan_id: proTrial.id },
		);
		expect(preview.total).toBe(0);
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Trial checkout replaced by another plan's checkout
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("trial-abandoned-checkout 2: replaced trial checkout does not consume the trial")}`,
	async () => {
		const customerId = `trial-abandoned-replaced-${Date.now()}`;
		const proTrial = proWithCardTrial({ id: "pro-trial-replaced" });
		const premium = products.premium({
			id: "premium-replaced",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { ctx, autumnV2_4, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proTrial, premium] }),
			],
			actions: [],
		});

		await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: proTrial.id,
			redirect_mode: "always",
		});
		await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "always",
		});

		await expectCustomerProductStatus({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
			productId: proTrial.id,
			status: CusProductStatus.Expired,
		});

		await expectTrialsUsedCorrect({
			customerId,
			autumn: autumnV2_4,
			planIds: [],
		});

		const preview = await autumnV2_4.billing.previewAttach<AttachParamsV1Input>(
			{ customer_id: customerId, plan_id: proTrial.id },
		);
		expect(preview.total).toBe(0);
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Trial checkout expires in Stripe
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("trial-abandoned-checkout 3: expired trial checkout does not consume the trial")}`,
	async () => {
		const customerId = `trial-abandoned-expired-${Date.now()}`;
		const proTrial = proWithCardTrial({ id: "pro-trial-expired" });

		const { ctx, autumnV2_4, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proTrial] }),
			],
			actions: [],
		});

		const result = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: proTrial.id,
			redirect_mode: "always",
		});

		await ctx.stripeCli.checkout.sessions.expire(
			checkoutSessionIdFromUrl({ url: result.payment_url }),
		);

		await expectCustomerProductStatus({
			ctx,
			internalCustomerId: customer?.internal_id ?? "",
			productId: proTrial.id,
			status: CusProductStatus.Expired,
		});

		await expectTrialsUsedCorrect({
			customerId,
			autumn: autumnV2_4,
			planIds: [],
		});

		const preview = await autumnV2_4.billing.previewAttach<AttachParamsV1Input>(
			{ customer_id: customerId, plan_id: proTrial.id },
		);
		expect(preview.total).toBe(0);
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Completed trial checkout still consumes the trial
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("trial-abandoned-checkout 4: completed trial checkout consumes the trial")}`,
	async () => {
		const customerId = `trial-abandoned-completed-${Date.now()}`;
		const proTrial = proWithCardTrial({ id: "pro-trial-completed" });

		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proTrial] }),
			],
			actions: [],
		});

		const result = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: proTrial.id,
			redirect_mode: "always",
		});

		await completeStripeCheckoutForm({ url: result.payment_url });

		await expectTrialsUsedCorrect({
			customerId,
			autumn: autumnV2_4,
			planIds: [proTrial.id],
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		});
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Open checkout reserves a unique-fingerprint trial
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("trial-abandoned-checkout 5: open checkout reserves the trial for a shared fingerprint")}`,
	async () => {
		const customerId = `trial-abandoned-fingerprint-${Date.now()}`;
		const otherCustomerId = `${customerId}-dup`;
		const fingerprint = `fp-${Date.now()}`;
		const proTrial = products.proWithTrial({
			id: "pro-trial-fingerprint",
			items: [items.monthlyMessages({ includedUsage: 500 })],
			trialDays: 7,
			cardRequired: true,
			uniqueFingerprint: true,
		});

		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, data: { fingerprint } }),
				s.otherCustomers([{ id: otherCustomerId, data: { fingerprint } }]),
				s.products({ list: [proTrial] }),
			],
			actions: [],
		});

		await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: proTrial.id,
			redirect_mode: "always",
		});

		const ownPreview =
			await autumnV2_4.billing.previewAttach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: proTrial.id,
			});
		expect(ownPreview.total).toBe(0);

		const otherPreview =
			await autumnV2_4.billing.previewAttach<AttachParamsV1Input>({
				customer_id: otherCustomerId,
				plan_id: proTrial.id,
			});
		expect(otherPreview.total).toBe(20);
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);
