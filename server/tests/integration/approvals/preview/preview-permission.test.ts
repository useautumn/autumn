import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Previews carry the stored rules' verdict as `permission`; with no rule naming the member, there is no field. */

test.concurrent(
	`${chalk.yellowBright("preview permission 1: permission matches the evaluator's verdict for the same facts")}`,
	async () => {
		const customerId = "approvals-preview-permission-deny";
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
			actions: [],
		});
		const [owner, sales] = members;
		const noCharge = rules.rule({
			name: "No-charge attaches",
			subjects: [{ type: "user", user_id: sales.userId }],
			when: { paid: false },
			note: "Sales can only attach plans that don't charge.",
		});
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: sales,
			rules: [noCharge],
		});
		// The same rule inline, so the test header's evaluator sees identical facts.
		client.headers["x-include-permission-facts"] = JSON.stringify({
			rules: [noCharge],
			principal: { type: "user", user_id: sales.userId, role: "sales" },
		});

		try {
			const preview = await client.billing.previewAttach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: pro.id,
			});

			const { permission, _permission: inline } = preview;
			expect(permission).toMatchObject({
				verdict: "deny",
				message: noCharge.note,
				violations: [
					{
						field: "paid",
						label: "Charges customer",
						limit: false,
						actual: true,
					},
				],
				decided_by: { level: "user", rule_name: noCharge.name },
			});
			expect(permission.verdict).toBe(inline.verdict);
			expect(permission.violations).toEqual(inline.violations);
			expect(permission.message).toBe(inline.message);
			expect(permission.allowed_roles).toEqual(inline.allowed_roles);
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("preview permission 2: an update preview carries permission for update_subscription")}`,
	async () => {
		const customerId = "approvals-preview-permission-update";
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
					name: "Cancels only",
					subjects: [{ type: "user", user_id: sales.userId }],
					actions: ["billing.cancel"],
				}),
			],
		});

		try {
			const preview = await client.billing.previewUpdate({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			});

			expect(preview.permission).toMatchObject({
				verdict: "allow",
				decided_by: { level: "user", rule_name: "Cancels only" },
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("preview permission 3: a set plans preview carries permission for set_plans")}`,
	async () => {
		const customerId = "approvals-preview-permission-set-plans";
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
			actions: [],
		});
		const [owner, sales] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: sales,
			rules: [
				rules.rule({
					name: "No-charge plan sets",
					subjects: [{ type: "user", user_id: sales.userId }],
					actions: ["billing.set_plans"],
					when: { paid: false },
				}),
			],
		});

		try {
			const preview = await client.billing.previewSetPlans({
				customer_id: customerId,
				phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
			});

			expect(
				(preview as typeof preview & { permission: unknown }).permission,
			).toMatchObject({
				verdict: "deny",
				violations: [expect.objectContaining({ field: "paid", actual: true })],
				decided_by: { level: "user", rule_name: "No-charge plan sets" },
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("preview permission 4: rules that name someone else leave no permission field")}`,
	async () => {
		const customerId = "approvals-preview-permission-fallback";
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
			actions: [],
		});
		const [owner, sales] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: sales,
			rules: [
				rules.rule({
					name: "Someone else's attaches",
					subjects: [{ type: "user", user_id: owner.userId }],
					when: { paid: false },
				}),
			],
		});

		try {
			const preview = await client.billing.previewAttach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: pro.id,
			});

			expect(preview.total).toBe(20);
			expect(preview).not.toHaveProperty("permission");
		} finally {
			await cleanup();
		}
	},
);
