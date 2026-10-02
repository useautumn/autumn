import { expect } from "bun:test";
import type { ApiBalanceV1 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

type WithBalances = { balances: Record<string, ApiBalanceV1> };

/** Polls the customer's (or one entity's) messages balance until it matches `expected`. */
export const expectMessagesBalance = ({
	autumn,
	customerId,
	entityId,
	expected,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId?: string;
	expected: Partial<ApiBalanceV1>;
}) =>
	pollUntilAsserted({
		fetch: async () => {
			const subject = entityId
				? await autumn.entities.get<WithBalances>(customerId, entityId)
				: await autumn.customers.get<WithBalances>(customerId);
			return subject.balances[TestFeature.Messages];
		},
		assert: (balance) => expect(balance).toMatchObject(expected),
	});
