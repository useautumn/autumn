import { describe, expect, test } from "bun:test";
import { insertCustomerToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/customer/insertCustomerToPlanOps.js";
import {
	defaultProduct,
	newCustomer,
	planOf,
	workerEntity,
} from "../../billingPlanFixtures.js";

const insertedRow = (customer: typeof newCustomer) => {
	const [op, ...rest] = insertCustomerToPlanOps({
		autumnBillingPlan: planOf({ insertCustomer: customer }),
	});
	expect(rest).toEqual([]);
	if (op?.op !== "insert" || op.table !== "customer")
		throw new Error("expected one customer insert");
	return op.row;
};

describe("insertCustomerToPlanOps", () => {
	test("a plan that creates no customer inserts none", () => {
		expect(insertCustomerToPlanOps({ autumnBillingPlan: planOf({}) })).toEqual(
			[],
		);
	});

	test("the customer is one insert, keeping the columns customers.get renders", () => {
		expect(insertedRow(newCustomer)).toMatchObject({
			internal_id: newCustomer.internal_id,
			id: "cus_test",
			org_id: newCustomer.org_id,
			env: newCustomer.env,
			name: "Test Customer",
			email: "test@example.com",
			metadata: {},
			processor: { type: "stripe", id: "cus_stripe_test" },
			send_email_receipts: false,
		});
	});

	test("the joined FullCustomer fields are not columns, so they are cut", () => {
		const row = insertedRow({
			...newCustomer,
			customer_products: [defaultProduct()],
			entities: [workerEntity],
		});
		expect(row).not.toHaveProperty("customer_products");
		expect(row).not.toHaveProperty("entities");
		expect(row).not.toHaveProperty("extra_customer_entitlements");
	});
});
