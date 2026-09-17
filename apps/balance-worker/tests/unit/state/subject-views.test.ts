import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyMutation,
	createSubjectState,
	meteringIdentityToSubjectKey,
	type SubjectState,
	type WorkerEntity,
} from "@autumn/balance-engine";
import { parsePartitionCheckpoint } from "../../../src/checkpoint/partitionCheckpoint.js";
import { openStateStore } from "../../../src/state/openStateStore.js";
import type { StateStore } from "../../../src/state/types/stateStore.js";
import {
	applyDurableMutation,
	createCustomerEntitlement,
	createCustomerProduct,
	createInitializeMutation,
	createTrackCommand,
	createTrackMutation,
	testIdentity as identity,
} from "../../fixtures/mutations.js";

const topic = "subject-views";
const partition = 0;
const limits = {
	maxSerializedBytes: 1_000_000,
	maxStates: 100,
	maxReceipts: 100,
};

const entity42: WorkerEntity = {
	id: "ent_42",
	internal_id: "ent_internal_42",
	internal_customer_id: "cus_internal_1",
	feature_id: "seats",
};
const entity43: WorkerEntity = {
	...entity42,
	id: "ent_43",
	internal_id: "ent_internal_43",
};

/** What an entity initialize carries: the entity and the seats row it owns. */
const createEntityState = ({
	entity,
}: {
	entity: WorkerEntity;
}): SubjectState =>
	createSubjectState({
		identity: { ...identity, entityId: entity.id },
		customerEntitlements: [
			{
				...createCustomerEntitlement({
					id: `seats_${entity.id}`,
					featureId: "seats",
					balance: 10,
				}),
				internal_entity_id: entity.internal_id,
			},
		],
		entity,
	});

const openFixture = () => {
	const directory = mkdtempSync(join(tmpdir(), "subject-views-"));
	const store = openStateStore({ databasePath: join(directory, "s.sqlite") });
	store.initializePartition({ topic, partition, nextOffset: 0n });
	return {
		store,
		close: () => {
			store.close();
			rmSync(directory, { recursive: true, force: true });
		},
	};
};

/** Customer at revision 1, then each entity joins at the next revision. */
const seed = ({ store }: { store: StateStore }): void => {
	const customer = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [
			createCustomerEntitlement({ id: "messages_monthly", balance: 10 }),
		],
	});
	let view = applyMutation({
		state: null,
		mutation: createInitializeMutation({ state: customer }),
	});
	applyDurableMutation({
		store,
		topic,
		partition,
		offset: 0n,
		mutation: createInitializeMutation({ state: customer }),
	});
	for (const [index, entity] of [entity42, entity43].entries()) {
		const mutation = createInitializeMutation({
			state: createEntityState({ entity }),
			revisionBefore: view.revision,
			commandId: `init_${entity.id}`,
		});
		applyDurableMutation({
			store,
			topic,
			partition,
			offset: BigInt(index + 1),
			mutation,
		});
		view = applyMutation({ state: view, mutation });
	}
};

const entitlementIdsOf = ({
	store,
	entityId,
}: {
	store: StateStore;
	entityId: string | null;
}) =>
	store
		.readState({ identity: { ...identity, entityId } })
		?.customerEntitlements.map((row) => row.id);

describe("subject views", () => {
	test("entity initializes add states under their own keys; each identity reads its own view", () => {
		const fixture = openFixture();
		try {
			seed({ store: fixture.store });
			const { store } = fixture;

			expect(entitlementIdsOf({ store, entityId: null })).toEqual([
				"messages_monthly",
			]);
			expect(store.readState({ identity })?.entity).toBeNull();
			expect(store.readState({ identity })?.revision).toBe(3);
			expect(entitlementIdsOf({ store, entityId: "ent_42" })).toEqual([
				"messages_monthly",
				"seats_ent_42",
			]);
			expect(
				store.readState({ identity: { ...identity, entityId: "ent_42" } })
					?.entity,
			).toEqual(entity42);
			expect(entitlementIdsOf({ store, entityId: "ent_99" })).toEqual([
				"messages_monthly",
			]);
			expect(
				store
					.readOwnState({ identity: { ...identity, entityId: "ent_43" } })
					?.customerEntitlements.map((row) => row.id),
			).toEqual(["seats_ent_43"]);
		} finally {
			fixture.close();
		}
	});

	test("an entity track writes only its own state and the customer's revision", () => {
		const fixture = openFixture();
		try {
			seed({ store: fixture.store });
			const { store } = fixture;
			const entityIdentity = { ...identity, entityId: "ent_42" };
			const view = store.readState({ identity: entityIdentity });
			if (!view) throw new Error("Expected the entity view");
			const mutation = createTrackMutation({
				state: view,
				command: createTrackCommand({
					identity: entityIdentity,
					featureId: "seats",
					value: 4,
				}),
			});
			applyDurableMutation({ store, topic, partition, offset: 3n, mutation });

			const balanceOf = ({ entityId }: { entityId: string | null }) =>
				store
					.readOwnState({ identity: { ...identity, entityId } })
					?.customerEntitlements.map((row) => row.balance);
			expect(store.readState({ identity })?.revision).toBe(4);
			expect(balanceOf({ entityId: "ent_42" })).toEqual([6]);
			expect(balanceOf({ entityId: "ent_43" })).toEqual([10]);
			expect(balanceOf({ entityId: null })).toEqual([10]);
		} finally {
			fixture.close();
		}
	});

	test("a checkpoint captures every subject state under its subject key", () => {
		const fixture = openFixture();
		try {
			seed({ store: fixture.store });
			const checkpoint = parsePartitionCheckpoint({
				input: fixture.store.capturePartitionCheckpoint({
					topic,
					partition,
					createdAt: 1_700_000_000_000,
					limits,
				}).serialized,
			});

			expect(checkpoint.states.map((state) => state.subjectKey)).toEqual(
				[
					meteringIdentityToSubjectKey({ identity }),
					meteringIdentityToSubjectKey({
						identity: { ...identity, entityId: "ent_42" },
					}),
					meteringIdentityToSubjectKey({
						identity: { ...identity, entityId: "ent_43" },
					}),
				].sort(),
			);
		} finally {
			fixture.close();
		}
	});
});
