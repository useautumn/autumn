/**
 * Entity objects accept and persist metadata, matching customers.
 *
 * Contract:
 *   Create with metadata → create / get / list return it.
 *   Create without metadata → metadata is {}.
 *   Update merges keys; null deletes a key; omitted metadata is left alone.
 */

import { expect, test } from "bun:test";
import type { ApiEntityV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	expectEntityMetadataCorrect,
	expectFetchedEntityMetadataCorrect,
} from "./utils/expectEntityMetadataCorrect.js";

test.concurrent(
	`${chalk.yellowBright("entity metadata: create persists metadata on create, get, and list")}`,
	async () => {
		const customerId = "ent-meta-create";
		const entityId = "deploy-aws";
		const metadata = {
			provisioned_through: "aws",
			suger_id: "sug_123",
		};

		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [s.customer({})],
			actions: [],
		});

		const created = (await autumnV2_4.entitiesV2.create({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Users,
			name: "AWS deploy",
			metadata,
		})) as ApiEntityV2;

		expectEntityMetadataCorrect({ entity: created, metadata });

		await expectFetchedEntityMetadataCorrect({
			autumn: autumnV2_4,
			customerId,
			entityId,
			metadata,
		});

		const listed = await autumnV2_4.entitiesV2.list<{ list: ApiEntityV2[] }>({
			customer_id: customerId,
			search: entityId,
			limit: 10,
		});
		const listedEntity = listed.list.find((entity) => entity.id === entityId);
		expect(listedEntity).toBeDefined();
		expectEntityMetadataCorrect({ entity: listedEntity!, metadata });
	},
);

test.concurrent(
	`${chalk.yellowBright("entity metadata: omitted metadata defaults to empty object")}`,
	async () => {
		const customerId = "ent-meta-default";
		const entityId = "deploy-plain";

		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [s.customer({})],
			actions: [],
		});

		const created = (await autumnV2_4.entitiesV2.create({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Users,
			name: "Plain deploy",
		})) as ApiEntityV2;

		expectEntityMetadataCorrect({ entity: created, metadata: {} });

		await expectFetchedEntityMetadataCorrect({
			autumn: autumnV2_4,
			customerId,
			entityId,
			metadata: {},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("entity metadata: update merges, deletes null keys, and leaves omitted metadata")}`,
	async () => {
		const customerId = "ent-meta-update";
		const entityId = "deploy-merge";

		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [s.customer({})],
			actions: [],
		});

		await autumnV2_4.entitiesV2.create({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Users,
			name: "Merge deploy",
			metadata: {
				provisioned_through: "aws",
				region: "us-east-1",
				tmp: "remove-me",
			},
		});

		const merged = (await autumnV2_4.entities.update(customerId, entityId, {
			metadata: {
				region: "us-west-2",
				tmp: null,
				owner: "suger",
			},
		})) as ApiEntityV2;

		const afterMerge = {
			provisioned_through: "aws",
			region: "us-west-2",
			owner: "suger",
		};
		expectEntityMetadataCorrect({ entity: merged, metadata: afterMerge });

		const omitted = (await autumnV2_4.entities.update(
			customerId,
			entityId,
			{},
		)) as ApiEntityV2;
		expectEntityMetadataCorrect({ entity: omitted, metadata: afterMerge });

		await expectFetchedEntityMetadataCorrect({
			autumn: autumnV2_4,
			customerId,
			entityId,
			metadata: afterMerge,
		});
	},
);
