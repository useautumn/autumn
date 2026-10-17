import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Previews carry the verdict of the rules that match the request; none match, no field. */

const setupMember = async ({
	customerId,
	role = "sales",
	attach = [],
	list,
}: {
	customerId: string;
	role?: "sales" | "owner";
	attach?: string[];
	list: Parameters<typeof s.products>[0]["list"];
}) => {
	const { ctx, members } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list }),
			s.member({ role: "owner" }),
			...(role === "owner" ? [] : [s.member({ role })]),
		],
		actions: attach.map((productId) => s.attach({ productId })),
	});
	const [owner, member = owner] = members;
	return { ctx, owner, member };
};

test.concurrent(
	`${chalk.yellowBright("preview permission 1: a block on paid denies a paid attach, naming its matched condition; a free attach matches nothing")}`,
	async () => {
		const customerId = "approvals-preview-permission-block";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const { ctx, owner, member } = await setupMember({
			customerId,
			list: [pro, free],
		});
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member,
			rules: [
				rules.block({
					name: "No charges",
					subjects: [{ type: "user", user_id: member.userId }],
					filter: { paid: true },
				}),
			],
		});

		try {
			const paid = await client.billing.previewAttach({
				customer_id: customerId,
				plan_id: pro.id,
			});
			expect(paid.permission).toMatchObject({
				verdict: "deny",
				violations: [expect.objectContaining({ field: "paid", actual: true })],
				decided_by: { level: "user", rule_name: "No charges" },
			});
			// Facts are a test-header aid, never part of a member's preview.
			expect(paid._permission_facts).toBeUndefined();

			const unpaid = await client.billing.previewAttach({
				customer_id: customerId,
				plan_id: free.id,
			});
			expect(unpaid.permission).toBeUndefined();
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("preview permission 2: an update that cancels is judged as billing.cancel; a later allow wins within the level")}`,
	async () => {
		const customerId = "approvals-preview-permission-cancel";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, owner, member } = await setupMember({
			customerId,
			list: [pro],
			attach: [pro.id],
		});
		const subjects = [{ type: "user" as const, user_id: member.userId }];
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member,
			rules: [
				rules.block({
					name: "No cancels",
					subjects,
					actions: ["billing.cancel"],
				}),
				rules.allow({
					name: "End-of-cycle cancels",
					subjects,
					actions: ["billing.cancel"],
					filter: { cancel_action: "cancel_end_of_cycle" },
				}),
			],
		});

		try {
			const immediate = await client.subscriptions.previewUpdate({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_immediately",
			});
			expect(immediate.permission).toMatchObject({
				verdict: "deny",
				decided_by: { rule_name: "No cancels" },
			});

			const endOfCycle = await client.subscriptions.previewUpdate({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			});
			expect(endOfCycle.permission).toMatchObject({
				verdict: "allow",
				decided_by: { rule_name: "End-of-cycle cancels" },
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("preview permission 3: owners are subject to rules; sandbox skips them")}`,
	async () => {
		const customerId = "approvals-preview-permission-owner";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, owner } = await setupMember({
			customerId,
			role: "owner",
			list: [pro],
		});
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: owner,
			rules: [
				rules.block({
					name: "Owner blocked",
					subjects: [{ type: "user", user_id: owner.userId }],
				}),
			],
		});
		const params = { customer_id: customerId, plan_id: pro.id };

		try {
			const asOwner = await client.billing.previewAttach(params);
			expect(asOwner.permission).toMatchObject({
				verdict: "deny",
				decided_by: { rule_name: "Owner blocked" },
			});

			delete client.headers["x-approvals-sandbox-as-live"];
			const inSandbox = await client.billing.previewAttach(params);
			expect(ctx.env).toBe(AppEnv.Sandbox);
			expect(inSandbox.permission).toBeUndefined();
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("preview permission 4: a multi-attach is judged plan by plan, any blocked plan denying it")}`,
	async () => {
		const customerId = "approvals-preview-permission-multi";
		const messages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ items: [messages] });
		const addon = products.recurringAddOn({ id: "addon", items: [messages] });
		const { ctx, owner, member } = await setupMember({
			customerId,
			list: [pro, addon],
		});
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member,
			rules: [
				rules.block({
					name: "No add-ons",
					subjects: [{ type: "user", user_id: member.userId }],
					filter: { incoming: { $some: { plan_id: addon.id } } },
				}),
			],
		});

		try {
			const preview = await client.billing.previewMultiAttach({
				customer_id: customerId,
				plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
			});
			expect(preview.permission).toMatchObject({
				verdict: "deny",
				decided_by: { rule_name: "No add-ons" },
			});
		} finally {
			await cleanup();
		}
	},
);
