import { describe, expect, test } from "bun:test";
import { createSetup } from "./createSetup.js";
import { orgSetups } from "./orgSetups.js";

describe("Leaf eval setup fixtures", () => {
	test("knowledge platform includes entity agent rules", () => {
		const setup = orgSetups.knowledgePlatform();

		expect(setup.agentRules.entity_rules).toEqual({
			attach_to_entities: true,
			entity_feature_id: "workspaces",
		});
		expect(setup.agentRules.notes).toBe("");
		expect(setup.refs.features.workspaces.id).toBe("workspaces");
	});

	test("flattens entity refs into setup entities and ids", () => {
		const setup = createSetup({
			tag: "entity-fixture",
			features: ({ features }) => ({
				deployments: features.allocated({ featureId: "deployments" }),
			}),
			plans: () => ({}),
			customers: ({ customers }) => ({
				account: customers.base({
					id: "cus_entity_fixture",
					name: "Entity Fixture Customer",
				}),
			}),
			entities: ({ customers, entities, features }) => ({
				deployment: entities.base({
					customer: customers.account,
					feature: features.deployments,
					id: "dep_fixture",
					name: "Production",
				}),
			}),
		});

		expect(setup.entities).toHaveLength(1);
		expect(setup.refs.entities.deployment.feature_id).toBe("deployments");
		expect(setup.ids.entities.deployment).toBe("dep_fixture");
	});
});
