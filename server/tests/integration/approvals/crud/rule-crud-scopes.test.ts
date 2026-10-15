/**
 * Rule routes are gated like other org settings (Track D, D2).
 *
 * Contract: writes need organisation:write (Developer 403, Admin 200); reads need organisation:read (Member 200).
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { rules } from "@tests/utils/fixtures/rules.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { approvalRulesApi } from "../utils/approvalRulesApi.js";

test(`${chalk.yellowBright("rule crud scopes: developer can't write, admin can, member can read")}`, async () => {
	const { ctx, members } = await initScenario({
		setup: [
			s.member({ role: "developer" }),
			s.member({ role: "admin" }),
			s.member({ role: "member" }),
		],
		actions: [],
	});
	const [developer, admin, member] = members;
	const params = rules.rule({ name: "Scope check" });

	try {
		const denied = await approvalRulesApi({ ctx, session: developer }).create(
			params,
		);
		expect(denied).toMatchObject({
			status: 403,
			data: { code: ErrCode.InsufficientScopes },
		});

		const asAdmin = approvalRulesApi({ ctx, session: admin });
		const created = await asAdmin.create(params);
		expect(created.status).toBe(200);

		const asMember = approvalRulesApi({ ctx, session: member });
		expect((await asMember.get(created.data.id)).status).toBe(200);
		expect((await asMember.delete(created.data.id)).status).toBe(403);

		await asAdmin.delete(created.data.id);
	} finally {
		await Promise.all(members.map((m) => m.cleanup()));
	}
});
