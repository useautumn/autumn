import { organizations } from "@autumn/shared";
import {
	createTestContext,
	type TestContext,
} from "@tests/utils/testInitUtils/createTestContext";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle";
import { OrgService } from "@/internal/orgs/OrgService";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache";
import { encryptData } from "@/utils/encryptUtils";

const ensureTestOrgUsesStripeSandboxKey = async (): Promise<TestContext> => {
	const sandboxSecretKey = process.env.STRIPE_SANDBOX_SECRET_KEY;
	if (!sandboxSecretKey?.startsWith("sk_test_")) {
		throw new Error(
			"STRIPE_SANDBOX_SECRET_KEY must be set to a Stripe test-mode secret key",
		);
	}

	const { db } = initDrizzle();
	const organizationSlug = process.env.TESTS_ORG;
	if (!organizationSlug) {
		throw new Error("TESTS_ORG must be set before running integration tests");
	}

	const organization = await OrgService.getBySlug({
		db,
		slug: organizationSlug,
	});
	if (!organization) {
		throw new Error(`Org with slug "${organizationSlug}" not found`);
	}

	await db
		.update(organizations)
		.set({
			stripe_connected: true,
			stripe_config: {
				...(organization.stripe_config || {}),
				test_api_key: encryptData(sandboxSecretKey),
			},
			test_stripe_connect: {},
		})
		.where(eq(organizations.id, organization.id));

	await clearOrgCache({
		db,
		orgId: organization.id,
	});

	return createTestContext();
};

let stripeSandboxContext: Promise<TestContext> | undefined;

export const getStripeSandboxContext = () => {
	stripeSandboxContext ??= ensureTestOrgUsesStripeSandboxKey();
	return stripeSandboxContext;
};
