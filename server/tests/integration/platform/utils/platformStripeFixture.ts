import { AppEnv, type Organization } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

type StripeRpcOperation = "get_stripe_connection" | "disconnect_stripe";

export const DISCONNECTED = {
	connected: false,
	account_id: null,
	connected_at: null,
};

export const callStripeRpc = ({
	operation,
	body,
	key = defaultCtx.orgSecretKey,
}: {
	operation: StripeRpcOperation;
	body: Record<string, unknown>;
	key?: string;
}) =>
	fetch(
		`${process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080"}/v1/platform.${operation}`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(key ? { Authorization: `Bearer ${key}` } : {}),
			},
			body: JSON.stringify(body),
		},
	);

const createPlatformStripeFixture = async ({ name }: { name: string }) => {
	const { ctx } = await initScenario({
		setup: [s.platform.create({ name })],
		actions: [],
	});
	const stripe = initMasterStripe({ env: AppEnv.Sandbox });
	const accountIds: string[] = [];

	const createAccount = async () => {
		const account = await stripe.accounts.create({
			type: "standard",
			country: "US",
		});
		accountIds.push(account.id);
		return account.id;
	};

	const update = (updates: Partial<Organization>) =>
		OrgService.update({ db: ctx.db, orgId: ctx.org.id, updates });

	const load = () => OrgService.get({ db: ctx.db, orgId: ctx.org.id });

	const cleanup = async () => {
		for (const accountId of accountIds)
			await stripe.accounts.del(accountId).catch(() => {});
		await update({
			test_stripe_connect: ctx.org.test_stripe_connect,
			live_stripe_connect: {},
			stripe_config: null,
		});
		await deletePlatformSubOrg({
			db: ctx.db,
			org: ctx.org,
			logger: ctx.logger,
			skipLiveCustomerCheck: true,
		});
	};

	return {
		ctx,
		stripe,
		slug: ctx.org.slug.split("|")[0],
		createAccount,
		update,
		load,
		cleanup,
	};
};

export type PlatformStripeFixture = Awaited<
	ReturnType<typeof createPlatformStripeFixture>
>;

/** Runs against a fresh platform sub-org and always removes it and its Stripe accounts. */
export const withPlatformStripeFixtures = async ({
	names,
	run,
}: {
	names: string[];
	run: (fixtures: PlatformStripeFixture[]) => Promise<void>;
}) => {
	const fixtures: PlatformStripeFixture[] = [];
	try {
		for (const name of names)
			fixtures.push(await createPlatformStripeFixture({ name }));
		await run(fixtures);
	} finally {
		for (const fixture of fixtures) await fixture.cleanup();
	}
};
