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
		_setOrgLimitsConfigForTesting({
			config: { orgs: { [ctx.org.id]: { maxEntities: 2 } } },
		});

		const capped = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		expect(capped.entities.length).toBe(2);

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
