/**
 * Reordering approval rules (Stage 3, D2a). approval_rules.reorder takes every rule id in the new
 * order and sets positions 0..n-1; within a level the later position wins.
 *
 * Contract:
 * - The response and later lists follow the new order; the next create goes to the end.
 * - Leaving a rule out or repeating one is 400 invalid_approval_rule on `ids`; an id that isn't a
 *   rule is 404 approval_rule_not_found. Nothing moves on a rejected reorder.
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { rules } from "@tests/utils/fixtures/rules.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { approvalRulesApi } from "../utils/approvalRulesApi.js";
import { expectApprovalRuleError } from "../utils/expectApprovalRuleError.js";

test(`${chalk.yellowBright("rule reorder: sets list order and positions, rejects partial, repeated and unknown ids")}`, async () => {
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" })],
		actions: [],
	});
	const [owner] = members;
	const api = approvalRulesApi({ ctx, session: owner });
	const created: string[] = [];
	const create = async (name: string) => {
		const { data } = await api.create(
			rules.block({ name, actions: ["billing.cancel"] }),
		);
		created.push(data.id);
		return data.id;
	};

	try {
		const a = await create("A");
		const b = await create("B");
		const c = await create("C");
		const others = (await api.list()).data.list
			.map((rule) => rule.id)
			.filter((id) => ![a, b, c].includes(id));
		const order = [c, ...others, a, b];

		const reordered = await api.reorder(order);
		expect(reordered.status).toBe(200);
		expect(reordered.data.list.map((rule) => [rule.id, rule.position])).toEqual(
			order.map((id, i) => [id, i]),
		);
		expect((await api.list()).data.list.map((rule) => rule.id)).toEqual(order);
		expect((await api.get(c)).data.version).toBe(1);

		const invalidIds = {
			status: 400,
			code: ErrCode.InvalidApprovalRule,
			issuePaths: ["ids"],
		};
		expectApprovalRuleError({
			res: await api.reorder(order.slice(1)),
			...invalidIds,
		});
		expectApprovalRuleError({
			res: await api.reorder([...order, a]),
			...invalidIds,
		});
		expectApprovalRuleError({
			res: await api.reorder([...order, "apr_missing"]),
			status: 404,
			code: ErrCode.ApprovalRuleNotFound,
		});
		expect((await api.list()).data.list.map((rule) => rule.id)).toEqual(order);

		const d = await create("D");
		expect((await api.get(d)).data.position).toBe(order.length);
	} finally {
		await Promise.all(created.map((id) => api.delete(id)));
		await owner.cleanup();
	}
});
