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

type PreparedCustomerProductExpectation = {
	customerId: string;
	productId?: string;
	entityId?: string;
	customerProductInternalProductId?: string;
	priceId: string;
	entitlementIds: string[];
};

export const expectPreparedRowsReusedByCustomerProducts = ({
	rows,
	expected,
}: {
	rows: PreparedCustomerRows;
	expected: PreparedCustomerProductExpectation[];
}) => {
	const migratedCustomerIds = new Set(rows.map((row) => row.customerId));
	expect(migratedCustomerIds).toEqual(
		new Set(expected.map((row) => row.customerId)),
	);

	for (const rowExpectation of expected) {
		const customerRows = rows.filter(
			(row) =>
				row.customerId === rowExpectation.customerId &&
				(rowExpectation.productId === undefined ||
					row.customerProductProductId === rowExpectation.productId) &&
				(rowExpectation.entityId === undefined ||
					row.customerProductEntityId === rowExpectation.entityId),
		);

		if (rowExpectation.customerProductInternalProductId) {
			expect(
				customerRows.some(
					(row) =>
						row.customerProductInternalProductId ===
						rowExpectation.customerProductInternalProductId,
				),
				`expected customer ${rowExpectation.customerId} to have customer product ${rowExpectation.customerProductInternalProductId}`,
			).toBe(true);
		}

		expect(
			customerRows.some((row) => row.priceId === rowExpectation.priceId),
			`expected customer ${rowExpectation.customerId} to reuse prepared price ${rowExpectation.priceId}`,
		).toBe(true);

		for (const entitlementId of rowExpectation.entitlementIds) {
			expect(
				customerRows.some((row) => row.entitlementId === entitlementId),
				`expected customer ${rowExpectation.customerId} to reuse prepared entitlement ${entitlementId}`,
			).toBe(true);
		}
	}
};

export const waitForPreparedRowsReusedByCustomerProducts = async ({
	loadRows,
	expected,
	timeoutMs = 60_000,
	pollIntervalMs = 1_000,
}: {
	loadRows: () => Promise<PreparedCustomerRows>;
	expected: PreparedCustomerProductExpectation[];
	timeoutMs?: number;
	pollIntervalMs?: number;
}) => {
	await waitForMigrationResult({
		timeoutMs,
		pollIntervalMs,
		waitFor: async () => {
			const rows = await loadRows();
			expectPreparedRowsReusedByCustomerProducts({ rows, expected });
		},
	});

	return loadRows();
};

export const expectPreparedRowsAnchoredToProducts = ({
	rows,
	priceIdToInternalProductId = {},
	entitlementIdToInternalProductId = {},
}: {
	rows: PreparedCustomerRows;
	priceIdToInternalProductId?: Record<string, string>;
	entitlementIdToInternalProductId?: Record<string, string>;
}) => {
	for (const [priceId, internalProductId] of Object.entries(
		priceIdToInternalProductId,
	)) {
		const preparedPriceRows = rows.filter((row) => row.priceId === priceId);
		expect(preparedPriceRows.length).toBeGreaterThan(0);
		expect(
			preparedPriceRows.every(
				(row) => row.priceInternalProductId === internalProductId,
			),
		).toBe(true);
	}

	for (const [entitlementId, internalProductId] of Object.entries(
		entitlementIdToInternalProductId,
	)) {
		const preparedEntitlementRows = rows.filter(
			(row) => row.entitlementId === entitlementId,
		);
		expect(preparedEntitlementRows.length).toBeGreaterThan(0);
		expect(
			preparedEntitlementRows.every(
				(row) => row.entitlementInternalProductId === internalProductId,
			),
		).toBe(true);
	}
};
