import { describe, expect, test } from "bun:test";
import type { MultiAttachBillingContext } from "@autumn/shared";
import type { BillingChangeFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import { billingApprovalItemFacts } from "@/internal/approvals/check/billingApprovalItemFacts";
import type { CheckBillingApprovalParams } from "@/internal/approvals/check/types/checkBillingApprovalParams";

const plan = (internalId: string) =>
	({
		product: { internal_id: internalId },
	}) as BillingChangeFacts["incoming"][number];

// The request-wide view a multi-attach builds: the first plan's entity, both plans.
const facts = {
	entity: { feature_id: "users" },
	incoming: [plan("prod_a"), plan("prod_b")],
} as unknown as BillingChangeFacts;

const billingContext = {
	productContexts: [
		{
			fullProduct: { internal_id: "prod_a" },
			fullCustomer: { entity: { feature_id: "users" } },
		},
		{
			fullProduct: { internal_id: "prod_b" },
			fullCustomer: { entity: { feature_id: "workspaces" } },
		},
	],
} as unknown as MultiAttachBillingContext;

const params = (route: CheckBillingApprovalParams["route"]) =>
	({ billingContext, route }) as unknown as CheckBillingApprovalParams;

describe("billingApprovalItemFacts", () => {
	test("a multi-attach gives each plan its own entity and only its own plan", () => {
		const items = billingApprovalItemFacts({
			params: params("billing.multi_attach"),
			facts,
		}) as BillingChangeFacts[];

		expect(items.map(({ entity, incoming }) => ({ entity, incoming }))).toEqual(
			[
				{ entity: { feature_id: "users" }, incoming: [plan("prod_a")] },
				{ entity: { feature_id: "workspaces" }, incoming: [plan("prod_b")] },
			],
		);
	});

	test("any other route is one item, as built", () => {
		expect(
			billingApprovalItemFacts({ params: params("billing.attach"), facts }),
		).toEqual([facts]);
	});
});
