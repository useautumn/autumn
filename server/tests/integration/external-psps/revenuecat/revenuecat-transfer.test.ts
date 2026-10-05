/**
 * RevenueCat TRANSFER: a restore moves a purchase from rc user A to rc user B.
 * Autumn must move the existing customer product (same id, balances, period) to B,
 * leave both RC identity mappings alone, and never re-grant credits.
 *
 * The RC read client is served from mock fixtures describing the DESTINATION's
 * current subscriptions/purchases, so these tests never touch api.revenuecat.com.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import {
	cusProductMessagesBalance,
	findActiveCusProduct,
	getInternalCustomer,
	listActiveRcCusProducts,
	newRcClient,
	purchaseOnA,
	rcPlan,
	setupCustomers,
} from "./utils/revenue-cat-transfer-test-utils";
import { expectWebhookSuccess } from "./utils/revenue-cat-webhook-client";

test.concurrent(
	`${chalk.yellowBright("rc transfer: moves the product with its remaining balance, then B's renewal does not re-grant")}`,
	async () => {
		const customerA = "rc-xfer-main";
		const customerB = `${customerA}-b`;
		const plan = rcPlan({ id: "rc-xfer-main-pro" });
		const { autumnV2_3 } = await setupCustomers({
			customerId: customerA,
			plans: [plan],
		});

		const { cusProduct: before, mock } = await purchaseOnA({
			plan,
			rcStoreId: "com.app.rc_xfer_main",
			rcInternalId: "prod_rc_xfer_main",
			subId: "sub_rc_xfer_main",
			customerId: customerA,
		});

		await autumnV2_3.track({
			customer_id: customerA,
			feature_id: TestFeature.Messages,
			value: 30,
		});
		const beforeTransfer =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerA);
		expect(beforeTransfer.balances[TestFeature.Messages]?.remaining).toBe(70);

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [customerB],
				mock,
			}),
		);

		const onB = await findActiveCusProduct({
			customerId: customerB,
			autumnProductId: plan.id,
		});
		expect(onB?.id).toBe(before.id);
		expect(onB?.processor?.id).toBe("sub_rc_xfer_main");
		expect(
			await findActiveCusProduct({
				customerId: customerA,
				autumnProductId: plan.id,
			}),
		).toBeUndefined();
		expect(cusProductMessagesBalance({ cusProduct: onB })).toBe(70);

		expectWebhookSuccess(
			await newRcClient().renewal({
				productId: "com.app.rc_xfer_main",
				appUserId: customerB,
			}),
		);
		const afterRenewal = await listActiveRcCusProducts({
			customerId: customerB,
		});
		expect(afterRenewal.filter((cp) => cp.product.id === plan.id)).toHaveLength(
			1,
		);
		expect(cusProductMessagesBalance({ cusProduct: afterRenewal[0] })).toBe(70);
		expect(
			await findActiveCusProduct({
				customerId: customerA,
				autumnProductId: plan.id,
			}),
		).toBeUndefined();

		const a = await getInternalCustomer(customerA);
		const b = await getInternalCustomer(customerB);
		expect(a.processors?.revenuecat?.id).toBe(customerA);
		expect(b.processors?.revenuecat?.id).toBe(customerB);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc transfer: duplicate TRANSFER is a 200 no-op")}`,
	async () => {
		const customerA = "rc-xfer-dup";
		const customerB = `${customerA}-b`;
		const plan = rcPlan({ id: "rc-xfer-dup-pro" });
		await setupCustomers({ customerId: customerA, plans: [plan] });
		const { cusProduct, mock } = await purchaseOnA({
			plan,
			rcStoreId: "com.app.rc_xfer_dup",
			rcInternalId: "prod_rc_xfer_dup",
			subId: "sub_rc_xfer_dup",
			customerId: customerA,
		});

		for (let attempt = 0; attempt < 2; attempt++) {
			expectWebhookSuccess(
				await newRcClient().transfer({
					transferredFrom: [customerA],
					transferredTo: [customerB],
					mock,
				}),
			);
		}

		const onB = await listActiveRcCusProducts({ customerId: customerB });
		expect(onB.map((cp) => cp.id)).toEqual([cusProduct.id]);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc transfer: same customer on both sides and unknown source are 200 no-ops")}`,
	async () => {
		const customerA = "rc-xfer-noop";
		const plan = rcPlan({ id: "rc-xfer-noop-pro" });
		await setupCustomers({ customerId: customerA, plans: [plan] });
		const { cusProduct, mock } = await purchaseOnA({
			plan,
			rcStoreId: "com.app.rc_xfer_noop",
			rcInternalId: "prod_rc_xfer_noop",
			subId: "sub_rc_xfer_noop",
			customerId: customerA,
		});

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [customerA],
				mock,
			}),
		);
		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: ["$RCAnonymousID:nobody"],
				transferredTo: [customerA],
				mock,
			}),
		);

		const stillOnA = await findActiveCusProduct({
			customerId: customerA,
			autumnProductId: plan.id,
		});
		expect(stillOnA?.id).toBe(cusProduct.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc transfer: only purchases RC reports on the destination move")}`,
	async () => {
		const customerA = "rc-xfer-partial";
		const customerB = `${customerA}-b`;
		const moved = rcPlan({ id: "rc-xfer-partial-pro" });
		const stays = rcPlan({ id: "rc-xfer-partial-other", group: "other" });
		await setupCustomers({ customerId: customerA, plans: [moved, stays] });

		await purchaseOnA({
			plan: stays,
			rcStoreId: "com.app.rc_xfer_stays",
			rcInternalId: "prod_rc_xfer_stays",
			subId: "sub_rc_xfer_stays",
			customerId: customerA,
		});
		const { cusProduct: movedBefore, mock } = await purchaseOnA({
			plan: moved,
			rcStoreId: "com.app.rc_xfer_moved",
			rcInternalId: "prod_rc_xfer_moved",
			subId: "sub_rc_xfer_moved",
			customerId: customerA,
		});

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [customerB],
				mock,
			}),
		);

		const onA = await listActiveRcCusProducts({ customerId: customerA });
		const onB = await listActiveRcCusProducts({ customerId: customerB });
		expect(onA.map((cp) => cp.product.id)).toEqual([stays.id]);
		expect(onB.map((cp) => cp.id)).toEqual([movedBefore.id]);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc transfer: replaces a different main plan the destination already has in the group")}`,
	async () => {
		const customerA = "rc-xfer-conflict";
		const customerB = `${customerA}-b`;
		const incoming = rcPlan({ id: "rc-xfer-conflict-pro" });
		const existing = rcPlan({ id: "rc-xfer-conflict-basic" });
		await setupCustomers({
			customerId: customerA,
			plans: [incoming, existing],
		});

		await purchaseOnA({
			plan: existing,
			rcStoreId: "com.app.rc_xfer_conflict_basic",
			rcInternalId: "prod_rc_xfer_conflict_basic",
			subId: "sub_rc_xfer_conflict_basic",
			customerId: customerB,
		});
		const { cusProduct, mock } = await purchaseOnA({
			plan: incoming,
			rcStoreId: "com.app.rc_xfer_conflict_pro",
			rcInternalId: "prod_rc_xfer_conflict_pro",
			subId: "sub_rc_xfer_conflict_pro",
			customerId: customerA,
		});

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [customerB],
				mock,
			}),
		);

		const onB = await listActiveRcCusProducts({ customerId: customerB });
		expect(onB.map((cp) => cp.id)).toEqual([cusProduct.id]);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc transfer: leaves the source product when the destination already has the same plan")}`,
	async () => {
		const customerA = "rc-xfer-same";
		const customerB = `${customerA}-b`;
		const plan = rcPlan({ id: "rc-xfer-same-pro" });
		await setupCustomers({ customerId: customerA, plans: [plan] });

		const { cusProduct: onAFirst, mock } = await purchaseOnA({
			plan,
			rcStoreId: "com.app.rc_xfer_same",
			rcInternalId: "prod_rc_xfer_same",
			subId: "sub_rc_xfer_same_a",
			customerId: customerA,
		});
		const { cusProduct: onBFirst } = await purchaseOnA({
			plan,
			rcStoreId: "com.app.rc_xfer_same",
			rcInternalId: "prod_rc_xfer_same",
			subId: "sub_rc_xfer_same_b",
			customerId: customerB,
		});

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [customerB],
				mock,
			}),
		);

		const onA = await listActiveRcCusProducts({ customerId: customerA });
		const onB = await listActiveRcCusProducts({ customerId: customerB });
		expect(onA.map((cp) => cp.id)).toEqual([onAFirst.id]);
		expect(onB.map((cp) => cp.id)).toEqual([onBFirst.id]);
	},
);
