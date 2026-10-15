import { expect, test } from "bun:test";
import { AppEnv, ErrCode, RESOURCES } from "@autumn/shared";
import type { RoleAccessMap } from "@autumn/shared/api/roles/apiRole";
import { approvalRulesApi } from "@tests/integration/approvals/utils/approvalRulesApi";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import {
	expectPermissionDenied,
	postRaw,
} from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import {
	autumnAs,
	type ScenarioMember,
} from "@tests/utils/testInitUtils/autumnAs.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import {
	createDashboardSession,
	dashboardFetch,
} from "@tests/utils/testInitUtils/dashboardSession.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** The most specific level with a rule decides, in both directions; no rule falls back to scopes. */

const salesLikeAccess = {
	...Object.fromEntries(RESOURCES.map((resource) => [resource, "none"])),
	customers: "write",
	billing: "write",
} as RoleAccessMap;

const json = (method: string, body?: unknown): RequestInit => ({
	method,
	headers: { "content-type": "application/json" },
	body: body === undefined ? undefined : JSON.stringify(body),
});

/** A member of a fresh custom role, so role-level rules can't decide other tests' requests. */
const createCustomRoleMember = async ({
	ctx,
	owner,
}: {
	ctx: TestContext;
	owner: ScenarioMember;
}) => {
	const role = `sales_${crypto.randomUUID().slice(0, 8)}`;
	await dashboardFetch(
		ctx,
		owner,
		"/roles",
		json("POST", { name: role, label: "Sales team", access: salesLikeAccess }),
	);
	const session = await createDashboardSession(ctx, { role });
	const member: ScenarioMember = { ...session, role, env: AppEnv.Sandbox };
	const deleteRole = async () => {
		await member.cleanup();
		await dashboardFetch(ctx, owner, `/roles/${role}`, json("DELETE"));
	};
	return { role, member, deleteRole };
};

test(`${chalk.yellowBright("levels enforce 1: a user rule narrows what the member's role allows")}`, async () => {
	const customerId = "approvals-levels-user-narrows";
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { ctx, members } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.member({ role: "owner" }),
		],
		actions: [],
	});
	const [owner] = members;
	const { role, member, deleteRole } = await createCustomRoleMember({
		ctx,
		owner,
	});
	const api = approvalRulesApi({ ctx, session: owner });
	const ruleIds = (
		await Promise.all([
			api.create(
				rules.rule({
					name: "Team attaches anything",
					subjects: [{ type: "role", role }],
				}),
			),
			api.create(
				rules.rule({
					name: "Free attaches only",
					subjects: [{ type: "user", user_id: member.userId }],
					when: { paid: false },
				}),
			),
		])
	).map(({ data }) => data.id);
	const client = autumnAs(member);
	client.headers["x-approvals-sandbox-as-live"] = "true";

	try {
		const res = await postRaw({
			client: enforceApprovals(client),
			path: "/billing.attach",
			body: { customer_id: customerId, plan_id: pro.id },
		});
		expectPermissionDenied({
			res,
			decidedBy: { level: "user", rule_name: "Free attaches only" },
			violations: [{ field: "paid", actual: true }],
			allowedRoles: ["owner", "admin", role],
		});
	} finally {
		await Promise.all(ruleIds.map((ruleId) => api.delete(ruleId)));
		await deleteRole();
		await owner.cleanup();
	}
});

test.concurrent(
	`${chalk.yellowBright("levels enforce 2: a rule lets a Member without billing:write attach a free plan")}`,
	async () => {
		const customerId = "approvals-levels-member-rule";
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, members } = await initScenario({
			customerId,
			setup: [
				s.customer({}),
				s.products({ list: [free] }),
				s.member({ role: "owner" }),
				s.member({ role: "member" }),
			],
			actions: [],
		});
		const [owner, viewer] = members;
		const params = { customer_id: customerId, plan_id: free.id };
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: viewer,
			rules: [
				rules.rule({
					name: "Free attaches",
					subjects: [{ type: "user", user_id: viewer.userId }],
					when: { paid: false },
				}),
			],
		});

		try {
			// Shadow mode changes nothing: the coarse scope check still applies.
			const shadow = await postRaw({
				client,
				path: "/billing.attach",
				body: params,
			});
			expect(shadow.status).toBe(403);
			expect(shadow.body.code).toBe(ErrCode.InsufficientScopes);

			const enforced = await postRaw({
				client: enforceApprovals(client),
				path: "/billing.attach",
				body: params,
			});
			expect(enforced.status).toBe(200);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("levels enforce 3: with no rule for cancel, a Sales cancel falls back to scopes and is allowed")}`,
	async () => {
		const customerId = "approvals-levels-cancel-fallback";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, members } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.member({ role: "owner" }),
				s.member({ role: "sales" }),
			],
			actions: [s.attach({ productId: pro.id })],
		});
		const [owner, sales] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: sales,
			rules: [
				rules.rule({
					name: "Free attaches",
					subjects: [{ type: "user", user_id: sales.userId }],
					when: { paid: false },
				}),
			],
		});

		try {
			const res = await postRaw({
				client: enforceApprovals(client),
				path: "/billing.update",
				body: {
					customer_id: customerId,
					plan_id: pro.id,
					cancel_action: "cancel_end_of_cycle",
				},
			});
			expect(res.status).toBe(200);
		} finally {
			await cleanup();
		}
	},
);
