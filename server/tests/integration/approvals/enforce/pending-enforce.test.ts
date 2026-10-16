import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	CusProductStatus,
	customers,
} from "@autumn/shared";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import { listDecisions } from "@tests/integration/approvals/utils/expectDecisionLogged";
import {
	expectPermissionDenied,
	postRaw,
} from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

test.concurrent(
	`${chalk.yellowBright("pending enforce: a denied pending-plan edit is a 403 and leaves the pending plan in place")}`,
	async () => {
		const customerId = `approvals-enforce-pending-${Date.now()}`;
		const pro = products.pro({
			id: "pro-pending-enforce",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, members, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
				s.member({ role: "owner" }),
				s.member({ role: "sales" }),
			],
			actions: [],
		});
		// No card on file, so the attach waits on checkout as a pending plan.
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
		});
		const listPendingRows = async () => {
			const dbCustomer = await ctx.db.query.customers.findFirst({
				where: eq(customers.id, customerId),
			});
			return CusProductService.list({
				db: ctx.db,
				internalCustomerId: dbCustomer!.internal_id,
				inStatuses: [CusProductStatus.Pending],
			});
		};
		const [pendingBefore] = await listPendingRows();
		const [owner, sales] = members;
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: sales,
			rules: [
				rules.block({
					name: "No charges",
					subjects: [{ type: "user", user_id: sales.userId }],
					actions: ["billing.update"],
					filter: { paid: true },
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
					customize: { price: itemsV2.monthlyPrice({ amount: 50 }) },
				},
			});
			expectPermissionDenied({ res, ruleName: "No charges" });

			const pendingAfter = await listPendingRows();
			expect(pendingAfter.map(({ id }) => id)).toEqual([pendingBefore.id]);

			// The deny stops the request before any write, so the gate logs it once.
			const decisions = await listDecisions({
				ctx,
				userId: sales.userId,
				action: "billing.update",
			});
			expect(decisions).toHaveLength(1);
			expect(decisions[0]).toMatchObject({ verdict: "deny", enforced: true });
		} finally {
			await cleanup();
		}
	},
);
