import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyMutation,
	createSubjectState,
	meteringIdentityToSubjectKey,
	type SubjectState,
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

const entity42 = {
	id: "ent_42",
	internal_id: "ent_internal_42",
	internal_customer_id: "cus_internal_1",
	feature_id: "seats",
};
const entity43 = { ...entity42, id: "ent_43", internal_id: "ent_internal_43" };
const entityRow = ({
	id,
	entity,
}: {
	id: string;
	entity: typeof entity42;
}) => ({
	...createCustomerEntitlement({ id, featureId: "seats", balance: 10 }),
	internal_entity_id: entity.internal_id,
});

/** A customer with a shared row and one row per entity, as one initialize view. */
const createViewWithEntities = (): SubjectState =>
	createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [
			createCustomerEntitlement({ id: "messages_monthly", balance: 10 }),
			entityRow({ id: "seats_ent_42", entity: entity42 }),
			entityRow({ id: "seats_ent_43", entity: entity43 }),
		],
		entities: [entity42, entity43],
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

const seed = ({ store }: { store: StateStore }): SubjectState => {
	const mutation = createInitializeMutation({
		state: createViewWithEntities(),
	});
	applyDurableMutation({ store, topic, partition, offset: 0n, mutation });
	return applyMutation({ state: null, mutation });
};

describe("subject views", () => {
	test("an initialize splits into one blob per subject and reads back as views", () => {
		const fixture = openFixture();
		try {
			seed({ store: fixture.store });

			const customerView = fixture.store.readState({ identity });
			const entityView = fixture.store.readState({
				identity: { ...identity, entityId: "ent_42" },
			});

			expect(customerView?.customerEntitlements.map((row) => row.id)).toEqual([
				"messages_monthly",
			]);
			expect(customerView?.entities.map((entity) => entity.id)).toEqual([
				"ent_42",
				"ent_43",
			]);
			expect(entityView?.customerEntitlements.map((row) => row.id)).toEqual([
				"messages_monthly",
				"seats_ent_42",
			]);
			expect(
				fixture.store
					.readState({ identity: { ...identity, entityId: "ent_99" } })
					?.customerEntitlements.map((row) => row.id),
			).toEqual(["messages_monthly"]);
		} finally {
			fixture.close();
		}
	});

	test("an entity track writes only its own blob and the customer's revision", () => {
		const fixture = openFixture();
		try {
			const initial = seed({ store: fixture.store });
			const entityIdentity = { ...identity, entityId: "ent_42" };
			const view = fixture.store.readState({ identity: entityIdentity });
			if (!view) throw new Error("Expected the entity view");
			const mutation = createTrackMutation({
				state: view,
				command: createTrackCommand({
					identity: entityIdentity,
					featureId: "seats",
					value: 4,
				}),
			});
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 1n,
				mutation,
			});

			const after42 = fixture.store.readState({ identity: entityIdentity });
			const after43 = fixture.store.readState({
				identity: { ...identity, entityId: "ent_43" },
			});
			const customer = fixture.store.readState({ identity });
			expect(after42?.revision).toBe(2);
			expect(
				after42?.customerEntitlements.find((row) => row.id === "seats_ent_42")
					?.balance,
			).toBe(6);
			expect(
				after43?.customerEntitlements.find((row) => row.id === "seats_ent_43")
					?.balance,
			).toBe(10);
			expect(customer?.revision).toBe(2);
			expect(
				customer?.customerEntitlements.find(
					(row) => row.id === "messages_monthly",
				)?.balance,
			).toBe(initial.customerEntitlements[0]?.balance);
		} finally {
			fixture.close();
		}
	});

	test("a checkpoint captures every blob under its subject key", () => {
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
