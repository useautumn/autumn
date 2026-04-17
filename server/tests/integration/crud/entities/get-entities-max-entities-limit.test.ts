import { afterAll, expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import type { OrgLimitsConfig } from "@/internal/misc/edgeConfig/orgLimitsSchemas.js";
import {
	_setOrgLimitsConfigForTesting,
	DEFAULT_ENTITIES_LIMIT,
	getOrgEntitiesLimit,
} from "@/internal/misc/edgeConfig/orgLimitsStore.js";

/**
 * These tests mutate the in-memory org limits store (a module-level singleton)
 * so they must run serially, not concurrently, to avoid leaking state into
 * unrelated tests.
 *
 * They call CusService.getFull directly (in-process) rather than going through
 * the HTTP server, because the running server has its own copy of the
 * orgLimitsStore that only refreshes from S3 every 30s. Calling in-process
 * exercises the same SQL path (getFullCusQuery -> buildEntitiesCTE) while
 * picking up the in-memory override immediately.
 */

const resetOrgLimits = () => {
	_setOrgLimitsConfigForTesting({ config: { orgs: {} } });
};

afterAll(() => {
	resetOrgLimits();
});

test(`${chalk.yellowBright("maxEntities: caps entities returned by CusService.getFull to configured limit")}`, async () => {
	const customerId = "max-entities-cap";
	const entityCount = 5;
	const maxEntities = 3;

	const { ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.entities({ count: entityCount, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	expect(entities.length).toBe(entityCount);

	try {
		const config: OrgLimitsConfig = {
			orgs: { [ctx.org.id]: { maxEntities } },
		};
		_setOrgLimitsConfigForTesting({ config });

		// Verify the accessor resolves to the override
		expect(getOrgEntitiesLimit({ orgId: ctx.org.id })).toBe(maxEntities);

		const fullCus = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});

		expect(fullCus.entities).toBeDefined();
		expect(fullCus.entities.length).toBe(maxEntities);
	} finally {
		resetOrgLimits();
	}
});

test(`${chalk.yellowBright("maxEntities: returns all entities when override is absent (falls back to default)")}`, async () => {
	const customerId = "max-entities-default";
	const entityCount = 4;

	const { ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.entities({ count: entityCount, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	expect(entities.length).toBe(entityCount);

	resetOrgLimits();

	// No override for this org -> default (300) applies
	expect(getOrgEntitiesLimit({ orgId: ctx.org.id })).toBe(
		DEFAULT_ENTITIES_LIMIT,
	);

	const fullCus = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});

	expect(fullCus.entities).toBeDefined();
	expect(fullCus.entities.length).toBe(entityCount);
});

test(`${chalk.yellowBright("maxEntities: raising the limit exposes previously-hidden entities")}`, async () => {
	const customerId = "max-entities-raise";
	const entityCount = 4;

	const { ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.entities({ count: entityCount, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	expect(entities.length).toBe(entityCount);

	try {
		// Start with a tight cap
		_setOrgLimitsConfigForTesting({
			config: { orgs: { [ctx.org.id]: { maxEntities: 2 } } },
		});

		const capped = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		expect(capped.entities.length).toBe(2);

		// Raise the cap above the entity count
		_setOrgLimitsConfigForTesting({
			config: { orgs: { [ctx.org.id]: { maxEntities: 50 } } },
		});

		const uncapped = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		expect(uncapped.entities.length).toBe(entityCount);
	} finally {
		resetOrgLimits();
	}
});
