import { expect, test } from "bun:test";
import type { BalanceTransition } from "@autumn/shared";
import {
	type BalanceCandidate,
	classifyBalanceTransitionPair,
} from "@/internal/customers/cache/fullSubject/actions/classifyBalanceTransitionPair.js";

const transition: BalanceTransition = {
	sourceCustomerEntitlementId: "source_messages",
	targetCustomerEntitlementId: "target_messages",
	sourceBalance: 95,
	sourceAdjustment: 0,
};
const balance = ({
	id,
	featureId = "messages",
	remaining = 95,
}: {
	id: string;
	featureId?: string;
	remaining?: number;
}) =>
	({
		id,
		feature_id: featureId,
		balance: remaining,
		adjustment: 0,
	}) as BalanceCandidate;

test("classifies simple transition pairs with named rejection reasons", () => {
	const source = balance({ id: "source_messages" });
	const target = balance({ id: "target_messages", remaining: 195 });

	expect(
		classifyBalanceTransitionPair({
			transition,
			sourceCustomerEntitlement: source,
			targetCustomerEntitlement: target,
			sourceAlreadyUsed: false,
			targetAlreadyUsed: false,
		}),
	).toBeUndefined();
	expect(
		classifyBalanceTransitionPair({
			transition,
			sourceCustomerEntitlement: source,
			targetCustomerEntitlement: balance({
				id: "target_emails",
				featureId: "emails",
			}),
			sourceAlreadyUsed: false,
			targetAlreadyUsed: false,
		}),
	).toBe("feature_mismatch");
	expect(
		classifyBalanceTransitionPair({
			transition,
			sourceCustomerEntitlement: source,
			targetCustomerEntitlement: target,
			sourceAlreadyUsed: false,
			targetAlreadyUsed: true,
		}),
	).toBe("duplicate_target_customer_entitlement");
});
