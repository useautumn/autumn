import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	ApiVersion,
	AppEnv,
	type CheckResponseV1,
	SuccessCode,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { generatePublishableKey } from "@/utils/encryptUtils.js";

// ═══════════════════════════════════════════════════════════════════
// Helper to set up public key test scenario
// ═══════════════════════════════════════════════════════════════════

async function setupPublicKeyScenario({ customerId }: { customerId: string }) {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId: cusId, autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Ensure test_pkey is set on the org
	if (!ctx.org.test_pkey) {
		const testPkey = generatePublishableKey(AppEnv.Sandbox);
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: { test_pkey: testPkey },
		});
		ctx.org.test_pkey = testPkey;
	}

	if (!ctx.org.test_pkey.startsWith("am_pk")) {
		throw new Error(
			`test_pkey "${ctx.org.test_pkey}" does not start with "am_pk". Expected format: am_pk_test_...`,
		);
	}

	const autumnPublic = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.org.test_pkey,
	});

	return { customerId: cusId, autumnV1, autumnPublic };
}

// ═══════════════════════════════════════════════════════════════════
// CHECK: Public key works for /check endpoint
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("check-public-key: /check works with public key")}`,
	async () => {
		const { customerId, autumnPublic } = await setupPublicKeyScenario({
			customerId: "check-public-key",
		});

		const checkRes = await autumnPublic.check<CheckResponseV1>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 100,
		});

		expect(checkRes).toMatchObject({
			allowed: true,
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance: 1000,
			required_balance: 100,
			code: SuccessCode.FeatureFound,
			usage: 0,
			included_usage: 1000,
			overage_allowed: false,
		});
		expect(checkRes.next_reset_at).toBeDefined();
	},
);

// ═══════════════════════════════════════════════════════════════════
// CHECK: send_event blocked with public key
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("check-public-key-send-event-blocked: send_event with public key should error")}`,
	async () => {
		const { customerId, autumnV1, autumnPublic } = await setupPublicKeyScenario(
			{ customerId: "check-public-key-send-event-blocked" },
		);

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const balanceBefore = customerBefore.features[TestFeature.Messages].balance;
		const usageBefore = customerBefore.features[TestFeature.Messages].usage;

		await expectAutumnError({
			func: async () => {
				await autumnPublic.check({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					required_balance: 50,
					send_event: true,
				});
			},
		});

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customerAfter.features[TestFeature.Messages].balance).toBe(
			balanceBefore,
		);
		expect(customerAfter.features[TestFeature.Messages].usage).toBe(
			usageBefore,
		);
	},
);

// ═══════════════════════════════════════════════════════════════════
// CHECK: send_event works with secret key
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("check-send-event: send_event with secret key tracks usage")}`,
	async () => {
		const { customerId, autumnV1 } = await setupPublicKeyScenario({
			customerId: "check-send-event",
		});

		// Should track usage when send_event: true with secret key
		const checkRes = await autumnV1.check<CheckResponseV1>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 150,
			send_event: true,
		});

		expect(checkRes.allowed).toBe(true);
		expect(checkRes.balance).toBe(1000 - 150);

		await timeout(2000);

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customerAfter.features[TestFeature.Messages].balance).toBe(850);
		expect(customerAfter.features[TestFeature.Messages].usage).toBe(150);

		// Should NOT track when allowed: false (insufficient balance)
		const checkResInsufficient = await autumnV1.check<CheckResponseV1>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 900, // More than available (850)
			send_event: true,
		});

		expect(checkResInsufficient.allowed).toBe(false);

		await timeout(2000);

		const customerAfterInsufficient =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Balance and usage should remain unchanged
		expect(customerAfterInsufficient.features[TestFeature.Messages].balance).toBe(850);
		expect(customerAfterInsufficient.features[TestFeature.Messages].usage).toBe(150);
	},
);
