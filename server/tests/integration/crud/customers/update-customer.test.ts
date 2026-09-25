import { expect, test } from "bun:test";
import { type ApiCustomerV5, ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE CUSTOMER TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("update: send_email_receipts can be updated")}`,
	async () => {
		const customerId = "update-send-email-receipts";
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.deleteCustomer({ customerId })],
			actions: [],
		});

		// Create customer without send_email_receipts
		const createData = await autumnV1.customers.create({
			id: customerId,
			name: "Update Email Receipts Customer",
			email: `${customerId}@example.com`,
		});

		expect(createData.send_email_receipts).toBe(false);

		// Update to enable send_email_receipts
		const updateData = await autumnV1.customers.update(customerId, {
			send_email_receipts: true,
		});

		expect(updateData.send_email_receipts).toBe(true);

		// Verify by getting the customer
		const getData = (await autumnV1.customers.get(customerId)) as {
			send_email_receipts: boolean;
		};

		expect(getData.send_email_receipts).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("update: send_email_receipts can be disabled")}`,
	async () => {
		const customerId = "update-send-email-receipts-disable";
		const { autumnV1 } = await initScenario({
			// customerId,
			setup: [s.deleteCustomer({ customerId })],
			actions: [],
		});

		// Create customer with send_email_receipts enabled
		const createData = await autumnV1.customers.create({
			id: customerId,
			name: "Disable Email Receipts Customer",
			email: `${customerId}@example.com`,
			send_email_receipts: true,
		});

		expect(createData.send_email_receipts).toBe(true);

		// Update to disable send_email_receipts
		const updateData = await autumnV1.customers.update(customerId, {
			send_email_receipts: false,
		});

		expect(updateData.send_email_receipts).toBe(false);

		// Verify by getting the customer
		const getData = (await autumnV1.customers.get(customerId)) as {
			send_email_receipts: boolean;
		};
		expect(getData.send_email_receipts).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("update: renaming a customer moves it to the new id and applies the other fields")}`,
	async () => {
		const customerId = "update-rename-from";
		const renamedId = "update-rename-to";
		const { autumnV2_2 } = await initScenario({
			setup: [
				s.deleteCustomer({ customerId }),
				s.deleteCustomer({ customerId: renamedId }),
			],
			actions: [],
		});

		await autumnV2_2.customers.create({
			id: customerId,
			name: "Before Rename",
			email: `${customerId}@example.com`,
		});

		const updated = await autumnV2_2.customers.updateRpc(customerId, {
			new_customer_id: renamedId,
			name: "After Rename",
		});
		expect(updated).toMatchObject({ id: renamedId, name: "After Rename" });

		const renamed = await autumnV2_2.customers.get<ApiCustomerV5>(renamedId);
		expect(renamed).toMatchObject({ id: renamedId, name: "After Rename" });

		await expectAutumnError({
			errCode: ErrCode.CustomerNotFound,
			func: () => autumnV2_2.customers.get(customerId),
		});
	},
);
