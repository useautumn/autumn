import { expect, test } from "bun:test";
import { createLedgerClient } from "@autumn/ledger/client";
import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const SERVER_PORT = 8080;
const LEDGER_PORT = 7000;
const LEDGER_TIMEOUT_MS = 10_000;

// The dev stack offsets every port by the same worktree stride, so the ledger
// port follows from whichever server the tests are pointed at.
const ledgerBaseUrl = () => {
	if (process.env.LEDGER_URL) return process.env.LEDGER_URL;

	const serverUrl = new URL(
		process.env.AUTUMN_TEST_BASE_URL || `http://localhost:${SERVER_PORT}`,
	);
	const offset = Number(serverUrl.port || SERVER_PORT) - SERVER_PORT;
	return `http://localhost:${LEDGER_PORT + offset}`;
};

const getJournalEntries = async ({ customerId }: { customerId: string }) => {
	const response = await fetch(
		`${ledgerBaseUrl()}/debug/journal?customer_id=${customerId}`,
	);
	const body = await response.json();
	return body.entries;
};

test.concurrent(
	`${chalk.yellowBright("ledger-track1: a track command deducts and appends one entry")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const freeProd = products.base({
			id: "ledger_free",
			items: [messagesItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "ledger-track1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerBefore.features[TestFeature.Messages].balance).toEqual(100);

		const ledger = createLedgerClient({
			baseUrl: ledgerBaseUrl(),
			timeoutMs: LEDGER_TIMEOUT_MS,
		});
		const commandId = `cmd_${customerId}_1`;
		const response = await ledger.track({
			id: commandId,
			org_id: ctx.org.id,
			env: ctx.env,
			customer_id: customerId,
			at: Date.now(),
			api_version: "1.2",
			kind: "track",
			body: {
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 5,
			},
		});

		expect(response).toMatchObject({
			customer_id: customerId,
			value: 5,
			balance: { feature_id: TestFeature.Messages, remaining: 95, usage: 5 },
		});

		const entries = await getJournalEntries({ customerId });
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ command_id: commandId, version: 1 });

		// The ledger is a shadow mirror: Postgres is untouched.
		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerAfter.features[TestFeature.Messages].balance).toEqual(100);
	},
);
