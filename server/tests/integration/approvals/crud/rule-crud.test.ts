/**
 * Approval rule CRUD over RPC (Stage 3, D2a). POST /approval_rules.<verb>, id in the body.
 *
 * Contract:
 * - create appends (position = last + 1) as version 1; update saves the next version and
 *   never moves the rule; delete returns { success: true } and History stays readable.
 * - Rule problems are 400 invalid_approval_rule with details.issues: validator issues, a moved
 *   position or unknown field, roles that don't exist and users who aren't members. A missing
 *   rule is 404.
 * - Envelope problems (no id, nothing to change, a non-object body) are 400 invalid_inputs.
 * - Concurrent updates serialize, so both land.
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { rules } from "@tests/utils/fixtures/rules.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { approvalRulesApi } from "../utils/approvalRulesApi.js";
import { expectApprovalRuleError } from "../utils/expectApprovalRuleError.js";

const cancelBlock = (name: string) =>
	rules.block({ name, actions: ["billing.cancel"] });

test(`${chalk.yellowBright("rule crud: create, get, list, update, versions and delete over RPC")}`, async () => {
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" })],
		actions: [],
	});
	const [owner] = members;
	const api = approvalRulesApi({ ctx, session: owner });
	const created: string[] = [];

	try {
		const first = await api.create(cancelBlock("First"));
		const second = await api.create(rules.allow({ name: "Second" }));
		created.push(first.data.id, second.data.id);
		expect(first).toMatchObject({
			status: 200,
			data: { name: "First", effect: "block", version: 1, enabled: true },
		});
		expect(first.data.id).toStartWith("apr_");
		expect(first.data.updated_by.user_id).toBe(owner.userId);
		expect(second.data.position).toBe(first.data.position + 1);

		expect((await api.get(first.data.id)).data).toEqual(first.data);
		const listed = (await api.list()).data.list.map((rule) => rule.id);
		expect(listed.indexOf(second.data.id)).toBe(
			listed.indexOf(first.data.id) + 1,
		);

		const updated = await api.update({ id: first.data.id, enabled: false });
		expect(updated.data).toMatchObject({
			version: 2,
			enabled: false,
			position: first.data.position,
		});

		const versions = (await api.versions(first.data.id)).data.list;
		expect(
			versions.map((v) => [v.version, v.rule.enabled, v.rule.effect]),
		).toEqual([
			[2, false, "block"],
			[1, true, "block"],
		]);

		expect((await api.delete(first.data.id)).data).toEqual({ success: true });
		expectApprovalRuleError({
			res: await api.get(first.data.id),
			status: 404,
			code: ErrCode.ApprovalRuleNotFound,
		});
		expect((await api.versions(first.data.id)).data.list).toHaveLength(2);
	} finally {
		await Promise.all(created.map((id) => api.delete(id)));
		await owner.cleanup();
	}
});

test(`${chalk.yellowBright("rule crud: invalid rules are 400 invalid_approval_rule with details.issues")}`, async () => {
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" }), s.member({ role: "member" })],
		actions: [],
	});
	const [owner, teammate] = members;
	const api = approvalRulesApi({ ctx, session: owner });
	const invalid = (path: string) => ({
		status: 400,
		code: ErrCode.InvalidApprovalRule,
		issuePaths: [path],
	});
	let ruleId = "";

	try {
		expectApprovalRuleError({
			res: await api.create({ ...cancelBlock("No one"), subjects: [] }),
			...invalid("subjects"),
		});
		expectApprovalRuleError({
			res: await api.create({
				...cancelBlock("Ghost role"),
				subjects: [{ type: "role", role_id: "ghost_role" }],
			}),
			...invalid("subjects.0.role_id"),
		});
		expectApprovalRuleError({
			res: await api.create({
				...cancelBlock("Outsider"),
				subjects: [{ type: "user", user_id: "usr_not_a_member" }],
			}),
			...invalid("subjects.0.user_id"),
		});

		const named = await api.create({
			...cancelBlock("Teammate"),
			subjects: [
				{ type: "user", user_id: teammate.userId },
				{ type: "role", role_id: "sales" },
			],
		});
		expect(named.status).toBe(200);
		ruleId = named.data.id;

		expectApprovalRuleError({
			res: await api.update({ id: ruleId, subjects: [] }),
			...invalid("subjects"),
		});
		expectApprovalRuleError({
			res: await api.update({ id: ruleId, position: 0 }),
			...invalid("position"),
		});
		expectApprovalRuleError({
			res: await api.create({ ...cancelBlock("Placed"), position: 0 }),
			...invalid("position"),
		});
		expectApprovalRuleError({
			res: await api.update({ id: ruleId, enabeld: false }),
			...invalid("enabeld"),
		});
		expectApprovalRuleError({
			res: await api.update({ id: "apr_missing", enabled: false }),
			status: 404,
			code: ErrCode.ApprovalRuleNotFound,
		});
		expect((await api.get(ruleId)).data.version).toBe(1);
	} finally {
		if (ruleId) await api.delete(ruleId);
		await Promise.all(members.map((m) => m.cleanup()));
	}
});

test(`${chalk.yellowBright("rule crud: envelope errors are 400 invalid_inputs, never 500")}`, async () => {
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" })],
		actions: [],
	});
	const [owner] = members;
	const api = approvalRulesApi({ ctx, session: owner });

	try {
		for (const [verb, body] of [
			["get", {}],
			["delete", {}],
			["update", { id: "apr_x" }],
			["reorder", { ids: [] }],
			["create", "[]"],
		] as const) {
			expectApprovalRuleError({
				res: await api.raw(verb, body),
				status: 400,
				code: ErrCode.InvalidInputs,
			});
		}
	} finally {
		await owner.cleanup();
	}
});

test(`${chalk.yellowBright("rule crud: concurrent updates both land")}`, async () => {
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "owner" })],
		actions: [],
	});
	const [owner] = members;
	const api = approvalRulesApi({ ctx, session: owner });
	const { data: rule } = await api.create(cancelBlock("Raced"));

	try {
		const results = await Promise.all([
			api.update({ id: rule.id, name: "Renamed" }),
			api.update({ id: rule.id, note: "Both edits land." }),
		]);
		expect(results.map((r) => r.status)).toEqual([200, 200]);
		expect((await api.get(rule.id)).data).toMatchObject({
			name: "Renamed",
			note: "Both edits land.",
			version: 3,
		});
	} finally {
		await api.delete(rule.id);
		await owner.cleanup();
	}
});
