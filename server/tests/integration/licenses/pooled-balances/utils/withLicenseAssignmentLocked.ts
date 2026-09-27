import { expect } from "bun:test";
import { customerProducts, customers } from "@autumn/shared";
import { createTestWait } from "@tests/utils/testWait/createTestWait.js";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const withLicenseAssignmentLocked = async ({
	ctx,
	assignmentId,
	fn,
}: {
	ctx: AutumnContext;
	assignmentId: string;
	fn: () => Promise<void>;
}) => {
	let signalLocked = () => {};
	const locked = new Promise<void>((resolve) => {
		signalLocked = resolve;
	});
	let releaseLock = () => {};
	const released = new Promise<void>((resolve) => {
		releaseLock = resolve;
	});
	const transaction = ctx.db.transaction(async (db) => {
		const assignments = await db
			.select({ id: customerProducts.id })
			.from(customerProducts)
			.innerJoin(
				customers,
				eq(customers.internal_id, customerProducts.internal_customer_id),
			)
			.where(
				and(
					eq(customerProducts.id, assignmentId),
					eq(customers.org_id, ctx.org.id),
					eq(customers.env, ctx.env),
				),
			)
			.for("update", { of: customerProducts });
		expect(assignments).toHaveLength(1);
		signalLocked();
		await released;
	});
	const wait = createTestWait({
		timeoutMs: 20_000,
		description: "Asynchronous license dispatch while its assignment is locked",
	});
	try {
		await wait.run(async () => {
			await Promise.race([locked, transaction]);
			await fn();
		});
	} finally {
		releaseLock();
		wait.close();
		await transaction;
	}
};
