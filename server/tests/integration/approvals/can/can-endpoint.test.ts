import { expect, test } from "bun:test";
import { approvalRulesApi } from "@tests/integration/approvals/utils/approvalRulesApi";
import { rules } from "@tests/utils/fixtures/rules";
import type { ScenarioMember } from "@tests/utils/testInitUtils/autumnAs.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { dashboardFetch } from "@tests/utils/testInitUtils/dashboardSession.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** `POST /approvals.can { action }` → `{ can, reason: "scope" | "blocked" | "none" }`. */

type CanResponse = {
	can?: boolean;
	reason?: string;
	code?: string;
	message?: string;
};

const askCan = ({
	ctx,
	member,
	action,
	live = true,
	enforced = true,
}: {
	ctx: TestContext;
	member: ScenarioMember;
	action: string;
	live?: boolean;
	enforced?: boolean;
}) =>
	dashboardFetch<CanResponse>(ctx, member, "/approvals.can", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(live && { "x-approvals-sandbox-as-live": "true" }),
			// Always sent, so the test sets the flag rather than reading the org's saved value.
			"org-config": JSON.stringify({ approvals_enforced: enforced }),
		},
		body: JSON.stringify({ action }),
	});

test.concurrent(
	`${chalk.yellowBright("can 1: no scope is none even with an allow rule naming them; a scoped member is scope")}`,
	async () => {
		const { ctx, members } = await initScenario({
			setup: [
				s.member({ role: "owner" }),
				s.member({ role: "member" }),
				s.member({ role: "developer" }),
			],
			actions: [],
		});
		const [owner, unscoped, developer] = members;
		const api = approvalRulesApi({ ctx, session: owner });
		const { data: rule } = await api.create(
			rules.allow({
				name: "Can 1 allow",
				subjects: [{ type: "user", user_id: unscoped.userId }],
			}),
		);

		try {
			const noScope = await askCan({
				ctx,
				member: unscoped,
				action: "billing.attach",
			});
			expect(noScope.data).toEqual({ can: false, reason: "none" });

			const scoped = await askCan({
				ctx,
				member: developer,
				action: "billing.attach",
			});
			expect(scoped.data).toEqual({ can: true, reason: "scope" });
		} finally {
			await api.delete(rule.id);
			await Promise.all(members.map((member) => member.cleanup()));
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("can 2: an owner under an unconditional block naming them is blocked when enforced; scope in shadow and sandbox")}`,
	async () => {
		const { ctx, members } = await initScenario({
			setup: [s.member({ role: "owner" })],
			actions: [],
		});
		const [owner] = members;
		const api = approvalRulesApi({ ctx, session: owner });
		const { data: rule } = await api.create(
			rules.block({
				name: "Can 2 block",
				subjects: [{ type: "user", user_id: owner.userId }],
				actions: ["billing.set_plans"],
			}),
		);

		try {
			const ask = (opts: { live?: boolean; enforced?: boolean }) =>
				askCan({ ctx, member: owner, action: "billing.set_plans", ...opts });

			expect((await ask({})).data).toEqual({ can: false, reason: "blocked" });
			expect((await ask({ enforced: false })).data).toEqual({
				can: true,
				reason: "scope",
			});
			expect((await ask({ live: false })).data).toEqual({
				can: true,
				reason: "scope",
			});
		} finally {
			await api.delete(rule.id);
			await Promise.all(members.map((member) => member.cleanup()));
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("can 3: a conditional block leaves can true; an unknown action is a 400 with the error envelope")}`,
	async () => {
		const { ctx, members } = await initScenario({
			setup: [s.member({ role: "owner" }), s.member({ role: "developer" })],
			actions: [],
		});
		const [owner, developer] = members;
		const api = approvalRulesApi({ ctx, session: owner });
		const { data: rule } = await api.create(
			rules.block({
				name: "Can 3 conditional block",
				subjects: [{ type: "user", user_id: developer.userId }],
				actions: ["billing.create_schedule"],
				filter: { paid: true },
			}),
		);

		try {
			const conditional = await askCan({
				ctx,
				member: developer,
				action: "billing.create_schedule",
			});
			expect(conditional.data).toEqual({ can: true, reason: "scope" });

			const unknown = await askCan({
				ctx,
				member: developer,
				action: "billing.teleport",
			});
			expect(unknown.status).toBe(400);
			expect(unknown.data.code).toEqual(expect.any(String));
			expect(unknown.data.message).toEqual(expect.any(String));
		} finally {
			await api.delete(rule.id);
			await Promise.all(members.map((member) => member.cleanup()));
		}
	},
);
