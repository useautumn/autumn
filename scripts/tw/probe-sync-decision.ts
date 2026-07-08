/** Debug: exec a sync-decision probe inside a kept tw worker sandbox. */
import { ModalClient } from "modal";

const sandboxId = process.argv[2];
const customerIds = process.argv.slice(3);
if (!sandboxId || customerIds.length === 0) {
	console.error(
		"usage: bun scripts/tw/probe-sync-decision.ts <sandboxId> <customerId...>",
	);
	process.exit(1);
}

const PROBE = String.raw`
import { test } from "bun:test";
import testCtx from "@tests/utils/testInitUtils/createTestContext";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { CusService } from "@/internal/customers/CusService";
import { canAutoSync } from "@/internal/billing/v2/actions/sync/canAutoSync/index.js";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";

const CUSTOMER_IDS: string[] = JSON.parse(process.env.PROBE_CUSTOMER_IDS ?? "[]");

test("probe sync decision", async () => {
	const ctx = testCtx;
	for (const customerId of CUSTOMER_IDS) {
	console.log("PROBE ===== customer", customerId);
	const fullCustomer = await CusService.getFull({ ctx, idOrInternalId: customerId });
	console.log("PROBE customer_products:", JSON.stringify(fullCustomer.customer_products.map((cp: any) => ({ id: cp.product?.id, status: cp.status, subs: cp.subscription_ids }))));
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const subs = await stripeCli.subscriptions.list({ customer: (fullCustomer as any).processor?.id, status: "all" });
	for (const sub of subs.data) {
		console.log("PROBE sub", sub.id, sub.status, "items:", sub.items.data.map((i: any) => ({ price: i.price.id, product: i.price.product, type: i.price.recurring?.usage_type, amount: i.price.unit_amount })));
		try {
			const { match } = await subscriptionToSyncParams({ ctx, customerId, subscription: sub, customerProducts: fullCustomer.customer_products });
			console.log("PROBE eligibility", sub.id, JSON.stringify(canAutoSync({ match })));
			for (const phase of match.phaseMatches) {
				console.log("PROBE phase current=", phase.is_current);
				for (const diff of phase.item_diffs) {
					console.log("  PROBE item", JSON.stringify({ price: (diff.stripe as any).price_id ?? (diff.stripe as any).id, match: diff.match.kind, matched_on: (diff.match as any).matched_on, product: (diff.match as any).product?.id }));
				}
				for (const plan of phase.plans) {
					console.log("  PROBE plan", JSON.stringify({ product: plan.product.id, base: plan.base, warnings: plan.warnings, features: plan.features, extras: plan.extras }));
				}
			}
		} catch (error) {
			console.log("PROBE detect THREW for", sub.id, (error as Error).stack);
		}
	}
	}
});
`;

const modal = new ModalClient();
const sandbox = await modal.sandboxes.fromId(sandboxId);
const writeProc = await sandbox.exec(
	["bash", "-lc", `cat > /repo/server/tests/probe-sync.test.ts <<'PROBE_EOF'\n${PROBE}\nPROBE_EOF\necho written`],
	{ stdout: "pipe", stderr: "pipe" },
);
console.log(await writeProc.stdout.readText());
console.error(await writeProc.stderr.readText());

const runProc = await sandbox.exec(
	[
		"bash",
		"-lc",
		`cd /repo/server && PROBE_CUSTOMER_IDS='${JSON.stringify(customerIds)}' bun test tests/probe-sync.test.ts 2>&1 | tail -120`,
	],
	{ stdout: "pipe", stderr: "pipe" },
);
console.log(await runProc.stdout.readText());
console.error(await runProc.stderr.readText());
process.exit(0);
