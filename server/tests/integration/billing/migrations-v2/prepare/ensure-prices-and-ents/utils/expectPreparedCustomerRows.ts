import { expect } from "bun:test";
import { waitForMigrationResult } from "../../../utils/runUpdatePlanMigration.js";
import type { getPreparedCustomerRows } from "./getPreparedCustomerRows.js";

type PreparedCustomerRows = Awaited<ReturnType<typeof getPreparedCustomerRows>>;

export const expectPreparedRowsReusedByCustomers = ({
	rows,
	customerIds,
	priceId,
	entitlementIds,
}: {
	rows: PreparedCustomerRows;
	customerIds: string[];
	priceId: string;
	entitlementIds: string[];
}) => {
	const migratedCustomerIds = new Set(rows.map((row) => row.customerId));
	expect(migratedCustomerIds).toEqual(new Set(customerIds));

	for (const customerId of customerIds) {
		const customerRows = rows.filter((row) => row.customerId === customerId);

		expect(
			customerRows.some((row) => row.priceId === priceId),
			`expected customer ${customerId} to reuse prepared price ${priceId}`,
		).toBe(true);

		for (const entitlementId of entitlementIds) {
			expect(
				customerRows.some((row) => row.entitlementId === entitlementId),
				`expected customer ${customerId} to reuse prepared entitlement ${entitlementId}`,
			).toBe(true);
		}
	}
};

export const waitForPreparedRowsReusedByCustomers = async ({
	loadRows,
	customerIds,
	priceId,
	entitlementIds,
	timeoutMs = 60_000,
	pollIntervalMs = 1_000,
}: {
	loadRows: () => Promise<PreparedCustomerRows>;
	customerIds: string[];
	priceId: string;
	entitlementIds: string[];
	timeoutMs?: number;
	pollIntervalMs?: number;
}) => {
	await waitForMigrationResult({
		timeoutMs,
		pollIntervalMs,
		waitFor: async () => {
			const rows = await loadRows();
			expectPreparedRowsReusedByCustomers({
				rows,
				customerIds,
				priceId,
				entitlementIds,
			});
		},
	});

	return loadRows();
};

export const expectPreparedRowsProductless = ({
	rows,
	priceIds,
	entitlementIds,
}: {
	rows: PreparedCustomerRows;
	priceIds: string[];
	entitlementIds: string[];
}) => {
	for (const priceId of priceIds) {
		const preparedPriceRows = rows.filter((row) => row.priceId === priceId);
		expect(preparedPriceRows.length).toBeGreaterThan(0);
		expect(
			preparedPriceRows.every((row) => row.priceInternalProductId === null),
		).toBe(true);
	}

	for (const entitlementId of entitlementIds) {
		const preparedEntitlementRows = rows.filter(
			(row) => row.entitlementId === entitlementId,
		);
		expect(preparedEntitlementRows.length).toBeGreaterThan(0);
		expect(
			preparedEntitlementRows.every(
				(row) => row.entitlementInternalProductId === null,
			),
		).toBe(true);
	}
};
