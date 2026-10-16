import { describe, expect, test } from "bun:test";
import type { MultiAttachBillingContext } from "@autumn/shared";
import type { BillingChangeFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import { splitMultiAttachFacts } from "@/internal/approvals/facts/billing/splitMultiAttachFacts";

const plan = (internalId: string) =>
	({
		product: { internal_id: internalId },
	}) as BillingChangeFacts["incoming"][number];

const facts = {
	entity: { feature_id: "seats" },
	incoming: [plan("prod_a"), plan("prod_b")],
} as unknown as BillingChangeFacts;

describe("splitMultiAttachFacts", () => {
	test("each plan keeps its own scope: an entity plan its entity, a customer-level plan null", () => {
		const billingContext = {
			productContexts: [
				{
					fullProduct: { internal_id: "prod_a" },
					fullCustomer: { entity: { feature_id: "seats" } },
				},
				{ fullProduct: { internal_id: "prod_b" }, fullCustomer: {} },
			],
		} as unknown as MultiAttachBillingContext;

		const items = splitMultiAttachFacts({ facts, billingContext });
		expect(items.map(({ entity }) => entity)).toEqual([
			{ feature_id: "seats" },
			null,
		]);
		expect(items.map(({ incoming }) => incoming)).toEqual([
			[plan("prod_a")],
			[plan("prod_b")],
		]);
	});
});
