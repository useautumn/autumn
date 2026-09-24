import { expect, test } from "bun:test";
import { OnDecrease, OnIncrease, type TrackResponseV2 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectFeatureCachedAndDb } from "@tests/integration/billing/utils/expectFeatureCachedAndDb.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";

// ═══════════════════════════════════════════════════════════════════
// Allocated Invoice — event_name fan-out
//
// One event ("seat-event") maps to a metered feature and a v1 paid
// allocated one. On the balance worker path each feature is tracked on
// its own engine: the metered one on the worker, the allocated one on
// Postgres (which invoices). Each must be deducted exactly once.
// ═══════════════════════════════════════════════════════════════════

const PRICE_PER_SEAT = 50;
const INCLUDED_SEATS = 1;
const INCLUDED_ACTIONS = 100;

const seatItem = constructArrearProratedItem({
	featureId: TestFeature.EventSeats,
	pricePerUnit: PRICE_PER_SEAT,
	includedUsage: INCLUDED_SEATS,
	config: {
		on_increase: OnIncrease.BillImmediately,
		on_decrease: OnDecrease.None,
	},
});
const actionItem = items.free({
	featureId: TestFeature.EventActions,
	includedUsage: INCLUDED_ACTIONS,
});

test(`${chalk.yellowBright("fan-out1: one event deducts the metered feature on the worker and the paid allocated one on Postgres, each once")}`, async () => {
	const pro = products.pro({ id: "pro", items: [seatItem, actionItem] });
	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "fan-out1",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Within the included seat: both features move, no invoice beyond the attach.
	const first: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		event_name: "seat-event",
		value: 1,
	});
	expect(first.balances?.[TestFeature.EventActions]).toMatchObject({
		current_balance: INCLUDED_ACTIONS - 1,
		usage: 1,
	});
	expect(first.balances?.[TestFeature.EventSeats]).toMatchObject({
		current_balance: 0,
		usage: 1,
	});
	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.EventActions,
		balance: INCLUDED_ACTIONS - 1,
		usage: 1,
	});
	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.EventSeats,
		balance: 0,
		usage: 1,
	});
	await expectCustomerInvoiceCorrect({ customerId, count: 1 });

	// Past the included seat: the allocated feature invoices, the metered one just moves.
	const second: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		event_name: "seat-event",
		value: 1,
	});
	expect(second.balances?.[TestFeature.EventActions]).toMatchObject({
		current_balance: INCLUDED_ACTIONS - 2,
		usage: 2,
	});
	expect(second.balances?.[TestFeature.EventSeats]).toMatchObject({
		current_balance: 0,
		purchased_balance: 1,
		usage: 2,
	});
	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.EventActions,
		balance: INCLUDED_ACTIONS - 2,
		usage: 2,
	});
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: PRICE_PER_SEAT,
	});
});
