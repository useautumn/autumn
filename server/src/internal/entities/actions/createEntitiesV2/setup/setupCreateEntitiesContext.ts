import {
	type CreateEntityParams,
	CusProductStatus,
	cusEntMatchesFeature,
	type Entity,
	type Feature,
	findFeatureById,
	fullCustomerToCustomerEntitlements,
	isFreeProduct,
	isUsageBasedAllocatedCustomerEntitlement,
	orgDefaultAppliesToEntities,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupDefaultProductsContext } from "@/internal/customers/actions/createWithDefaults/setup/setupDefaultProductsContext.js";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { constructEntity } from "../../../entityUtils/entityUtils.js";
import { listEntitiesById } from "../../../repos/listEntitiesById.js";
import type { CreateEntitiesContext } from "../types/createEntitiesContext.js";
import type { CreateEntitiesParams } from "../types/createEntitiesParams.js";
import type { EntitiesByFeature } from "../types/entitiesByFeature.js";

const findClaimedEntity = ({
	ctx,
	existingEntities,
	requestedEntities,
	features,
}: {
	ctx: AutumnContext;
	existingEntities: Entity[];
	requestedEntities: CreateEntityParams[];
	features: Feature[];
}): CreateEntitiesContext["claimedEntity"] => {
	const existing = existingEntities.find((entity) => entity.id === null);
	if (!existing) return undefined;
	const index = requestedEntities.findIndex(
		(entity, i) =>
			entity.id !== null &&
			features[i].internal_id === existing.internal_feature_id,
	);
	if (index === -1) return undefined;
	const claimed = constructEntity({
		inputEntity: requestedEntities[index],
		feature: features[index],
		internalCustomerId: existing.internal_customer_id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return {
		existing,
		claimed: {
			...claimed,
			internal_id: existing.internal_id,
			created_at: existing.created_at,
		},
	};
};

const groupEntitiesByFeature = ({
	entities,
	features,
}: {
	entities: { inserted: Entity[]; claimed: Entity[] };
	features: Feature[];
}): EntitiesByFeature[] =>
	features
		.map((feature) => {
			const ofFeature = (entity: Entity) =>
				entity.internal_feature_id === feature.internal_id;
			return {
				feature,
				inserted: entities.inserted.filter(ofFeature),
				claimed: entities.claimed.filter(ofFeature),
			};
		})
		.filter((group) => group.inserted.length + group.claimed.length > 0);

export const setupCreateEntitiesContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateEntitiesParams;
}): Promise<CreateEntitiesContext> => {
	const { customerId, customerData, entities: requestedEntities } = params;

	const fullCustomer = await getOrCreateCustomer({
		ctx,
		customerId,
		customerData,
	});

	const defaultProducts = orgDefaultAppliesToEntities({ ctx })
		? await setupDefaultProductsContext({ ctx, customerData, scope: "entity" })
		: { fullProducts: [] };

	const existingEntities = await listEntitiesById({
		ctx,
		internalCustomerId: fullCustomer.internal_id,
		entityIds: requestedEntities.flatMap((entity) =>
			entity.id === null ? [] : [entity.id],
		),
	});

	const features = requestedEntities.map((entity) =>
		findFeatureById({
			features: ctx.features,
			featureId: entity.feature_id,
			errorOnNotFound: true,
		}),
	);
	const uniqueFeatures = [
		...new Map(features.map((feature) => [feature.id, feature])).values(),
	];

	const claimedEntity = findClaimedEntity({
		ctx,
		existingEntities,
		requestedEntities,
		features,
	});

	const insertedEntities = requestedEntities.flatMap((entity, index) => {
		if (entity.id !== null && entity.id === claimedEntity?.claimed.id)
			return [];
		return [
			constructEntity({
				inputEntity: entity,
				feature: features[index],
				internalCustomerId: fullCustomer.internal_id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		];
	});

	const customerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer,
		inStatuses: [
			CusProductStatus.Active,
			CusProductStatus.PastDue,
			CusProductStatus.Scheduled,
		],
	});
	const entitiesByFeature = groupEntitiesByFeature({
		entities: {
			inserted: insertedEntities,
			claimed: claimedEntity ? [claimedEntity.claimed] : [],
		},
		features: uniqueFeatures,
	});

	return {
		fullCustomer,
		customerEntitlements,
		currentEpochMs: Date.now(),
		requestedEntities,
		existingEntities,
		insertedEntities,
		claimedEntity,
		entitiesByFeature,
		defaultProducts: defaultProducts.fullProducts.filter((product) =>
			isFreeProduct({ product }),
		),
		invoicedCustomerEntitlements: entitiesByFeature
			.filter(({ inserted }) => inserted.length > 0)
			.flatMap(({ feature }) =>
				customerEntitlements.filter(
					(cusEnt) =>
						cusEntMatchesFeature({ cusEnt, feature }) &&
						isUsageBasedAllocatedCustomerEntitlement(cusEnt),
				),
			),
	};
};
