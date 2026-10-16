import { expect, test } from "bun:test";
import { approvalRulesApi } from "@tests/integration/approvals/utils/approvalRulesApi";
import { rules } from "@tests/utils/fixtures/rules";
import type { ScenarioMember } from "@tests/utils/testInitUtils/autumnAs.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { dashboardFetch } from "@tests/utils/testInitUtils/dashboardSession.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** `GET /approvals/can?action=` → `{ can, reason: "rule" | "scope" | "exempt" | "none" }` (§R). */

type CanResponse = { can: boolean; reason: string };

const askCan = async ({
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
	dashboardFetch<CanResponse>(ctx, member, `/approvals/can?action=${action}`, {
		headers: {
			...(live ? { "x-approvals-sandbox-as-live": "true" } : {}),
			// Always sent, so the test sets the flag rather than reading the org's saved value.
			"org-config": JSON.stringify({ approvals_enforced: enforced }),
		},
	});

test.concurrent(
	`${chalk.yellowBright("can 1: a Member with a rule can; without one they can't; Developer can by scope")}`,
	async () => {
		const { ctx, members } = await initScenario({
			setup: [
				s.member({ role: "owner" }),
				s.member({ role: "member" }),
				s.member({ role: "member" }),
				s.member({ role: "developer" }),
			],
			actions: [],
		});
		const [owner, ruled, unruled, developer] = members;
		const api = approvalRulesApi({ ctx, session: owner });
		const { data: rule } = await api.create(
			rules.rule({
				name: "Free attaches",
				subjects: [{ type: "user", user_id: ruled.userId }],
				when: { paid: false },
			}),
		);

		try {
			expect(
				(await askCan({ ctx, member: ruled, action: "billing.attach" })).data,
			).toEqual({ can: true, reason: "rule" });
			expect(
				(await askCan({ ctx, member: unruled, action: "billing.attach" })).data,
			).toEqual({ can: false, reason: "none" });
			expect(
				(await askCan({ ctx, member: developer, action: "billing.attach" }))
					.data,
			).toEqual({ can: true, reason: "scope" });
		} finally {
			await api.delete(rule.id);
			await Promise.all(members.map((member) => member.cleanup()));
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("can 2: Owner and sandbox are exempt; a rule only grants access once the org enforces approvals")}`,
	async () => {
		const { ctx, members } = await initScenario({
			setup: [s.member({ role: "owner" }), s.member({ role: "member" })],
			actions: [],
		});
		const [owner, ruled] = members;
		const api = approvalRulesApi({ ctx, session: owner });
		const { data: rule } = await api.create(
			rules.rule({
				name: "Any attach",
				subjects: [{ type: "user", user_id: ruled.userId }],
			}),
		);

		try {
			expect(
				(await askCan({ ctx, member: owner, action: "billing.attach" })).data,
			).toEqual({ can: true, reason: "exempt" });
			expect(
				(
					await askCan({
						ctx,
						member: ruled,
						action: "billing.attach",
						live: false,
					})
				).data,
			).toEqual({ can: true, reason: "exempt" });
			expect(
				(
					await askCan({
						ctx,
						member: ruled,
						action: "billing.attach",
						enforced: false,
					})
				).data,
			).toEqual({ can: false, reason: "none" });
		} finally {
			await api.delete(rule.id);
			await Promise.all(members.map((member) => member.cleanup()));
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("can 3: an unknown action is a 400")}`,
	async () => {
		const { ctx, members } = await initScenario({
			setup: [s.member({ role: "member" })],
			actions: [],
		});
		const [member] = members;

		try {
			const res = await askCan({ ctx, member, action: "billing.teleport" });
			expect(res.status).toBe(400);
		} finally {
			await member.cleanup();
		}
	},
);
