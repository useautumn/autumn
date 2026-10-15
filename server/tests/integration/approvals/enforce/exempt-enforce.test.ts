import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import { postRaw } from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { autumnAs } from "@tests/utils/testInitUtils/autumnAs.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

/** Owner, Admin, sandbox and API keys are never blocked, even by a rule naming everyone. */

const setupDenyEveryone = async ({
	customerId,
	actorRole,
}: {
	customerId: string;
	actorRole: "owner" | "sales";
}) => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { ctx, members } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.member({ role: "owner" }),
			s.member({ role: actorRole }),
		],
		actions: [],
	});
	const [owner, actor] = members;
	const { client, cleanup } = await setupApprovalRules({
		ctx,
		owner,
		member: actor,
		rules: [
			rules.rule({
				name: "No paid attaches",
				subjects: [{ type: "user", user_id: actor.userId }],
				when: { paid: false },
			}),
		],
	});
	return { ctx, pro, actor, client, cleanup };
};

test.concurrent(
	`${chalk.yellowBright("exempt enforce 1: an Owner named by a denying rule still attaches")}`,
	async () => {
		const customerId = "approvals-exempt-owner";
		const { pro, client, cleanup } = await setupDenyEveryone({
			customerId,
			actorRole: "owner",
		});

		try {
			const res = await postRaw({
				client: enforceApprovals(client),
				path: "/billing.attach",
				body: { customer_id: customerId, plan_id: pro.id },
			});
			expect(res.status).toBe(200);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("exempt enforce 2: in sandbox the same denying rule doesn't apply")}`,
	async () => {
		const customerId = "approvals-exempt-sandbox";
		const { pro, actor, cleanup } = await setupDenyEveryone({
			customerId,
			actorRole: "sales",
		});

		try {
			// No sandbox-as-live header: the request is evaluated in its real env.
			const res = await postRaw({
				client: enforceApprovals(autumnAs(actor)),
				path: "/billing.attach",
				body: { customer_id: customerId, plan_id: pro.id },
			});
			expect(res.status).toBe(200);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("exempt enforce 3: API keys keep their scopes and aren't rule subjects")}`,
	async () => {
		const customerId = "approvals-exempt-api-key";
		const { ctx, pro, cleanup } = await setupDenyEveryone({
			customerId,
			actorRole: "sales",
		});
		const apiKeyClient = enforceApprovals(
			new AutumnInt({
				version: ApiVersion.V2_1,
				secretKey: ctx.orgSecretKey,
				headers: { "x-approvals-sandbox-as-live": "true" },
			}),
		);

		try {
			const res = await postRaw({
				client: apiKeyClient,
				path: "/billing.attach",
				body: { customer_id: customerId, plan_id: pro.id },
			});
			expect(res.status).toBe(200);
		} finally {
			await cleanup();
		}
	},
);
