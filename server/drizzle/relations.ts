import { relations } from "drizzle-orm/relations";
import { organizations, apiKeys, rewards, rewardPrograms, customerProducts, customerPrices, customers, prices, entities, features, entitlements, products, events, freeTrials, invoiceItems, rewardRedemptions, referralCodes, migrationJobs, subscriptions, migrationErrors } from "./schema";

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
	organization: one(organizations, {
		fields: [apiKeys.orgId],
		references: [organizations.id]
	}),
}));

export const organizationsRelations = relations(organizations, ({many}) => ({
	apiKeys: many(apiKeys),
	rewards: many(rewards),
	rewardPrograms: many(rewardPrograms),
	entities: many(entities),
	features: many(features),
	products: many(products),
	migrationJobs: many(migrationJobs),
	subscriptions: many(subscriptions),
	referralCodes: many(referralCodes),
}));

export const rewardsRelations = relations(rewards, ({one, many}) => ({
	organization: one(organizations, {
		fields: [rewards.orgId],
		references: [organizations.id]
	}),
	rewardPrograms: many(rewardPrograms),
}));

export const rewardProgramsRelations = relations(rewardPrograms, ({one, many}) => ({
	reward: one(rewards, {
		fields: [rewardPrograms.internalRewardId],
		references: [rewards.internalId]
	}),
	organization: one(organizations, {
		fields: [rewardPrograms.orgId],
		references: [organizations.id]
	}),
	rewardRedemptions: many(rewardRedemptions),
	referralCodes: many(referralCodes),
}));

export const customerPricesRelations = relations(customerPrices, ({one, many}) => ({
	customerProduct: one(customerProducts, {
		fields: [customerPrices.customerProductId],
		references: [customerProducts.id]
	}),
	customer: one(customers, {
		fields: [customerPrices.internalCustomerId],
		references: [customers.internalId]
	}),
	price: one(prices, {
		fields: [customerPrices.priceId],
		references: [prices.id]
	}),
	invoiceItems: many(invoiceItems),
}));

export const customerProductsRelations = relations(customerProducts, ({one, many}) => ({
	customerPrices: many(customerPrices),
	freeTrial: one(freeTrials, {
		fields: [customerProducts.freeTrialId],
		references: [freeTrials.id]
	}),
	customer: one(customers, {
		fields: [customerProducts.internalCustomerId],
		references: [customers.internalId]
	}),
	entity: one(entities, {
		fields: [customerProducts.internalEntityId],
		references: [entities.internalId]
	}),
	product: one(products, {
		fields: [customerProducts.internalProductId],
		references: [products.internalId]
	}),
}));

export const customersRelations = relations(customers, ({many}) => ({
	customerPrices: many(customerPrices),
	entities: many(entities),
	events: many(events),
	customerProducts: many(customerProducts),
	rewardRedemptions: many(rewardRedemptions),
	referralCodes: many(referralCodes),
	migrationErrors: many(migrationErrors),
}));

export const pricesRelations = relations(prices, ({one, many}) => ({
	customerPrices: many(customerPrices),
	entitlement: one(entitlements, {
		fields: [prices.entitlementId],
		references: [entitlements.id]
	}),
	product: one(products, {
		fields: [prices.internalProductId],
		references: [products.internalId]
	}),
}));

export const entitiesRelations = relations(entities, ({one, many}) => ({
	customer: one(customers, {
		fields: [entities.internalCustomerId],
		references: [customers.internalId]
	}),
	feature: one(features, {
		fields: [entities.internalFeatureId],
		references: [features.internalId]
	}),
	organization: one(organizations, {
		fields: [entities.orgId],
		references: [organizations.id]
	}),
	customerProducts: many(customerProducts),
}));

export const featuresRelations = relations(features, ({one, many}) => ({
	entities: many(entities),
	entitlements: many(entitlements),
	organization: one(organizations, {
		fields: [features.orgId],
		references: [organizations.id]
	}),
}));

export const entitlementsRelations = relations(entitlements, ({one, many}) => ({
	feature: one(features, {
		fields: [entitlements.internalFeatureId],
		references: [features.internalId]
	}),
	product: one(products, {
		fields: [entitlements.internalProductId],
		references: [products.internalId]
	}),
	prices: many(prices),
}));

export const productsRelations = relations(products, ({one, many}) => ({
	entitlements: many(entitlements),
	freeTrials: many(freeTrials),
	customerProducts: many(customerProducts),
	prices: many(prices),
	organization: one(organizations, {
		fields: [products.orgId],
		references: [organizations.id]
	}),
	migrationJobs_fromInternalProductId: many(migrationJobs, {
		relationName: "migrationJobs_fromInternalProductId_products_internalId"
	}),
	migrationJobs_toInternalProductId: many(migrationJobs, {
		relationName: "migrationJobs_toInternalProductId_products_internalId"
	}),
}));

export const eventsRelations = relations(events, ({one}) => ({
	customer: one(customers, {
		fields: [events.internalCustomerId],
		references: [customers.internalId]
	}),
}));

export const freeTrialsRelations = relations(freeTrials, ({one, many}) => ({
	product: one(products, {
		fields: [freeTrials.internalProductId],
		references: [products.internalId]
	}),
	customerProducts: many(customerProducts),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({one}) => ({
	customerPrice: one(customerPrices, {
		fields: [invoiceItems.customerPriceId],
		references: [customerPrices.id]
	}),
}));

export const rewardRedemptionsRelations = relations(rewardRedemptions, ({one}) => ({
	customer: one(customers, {
		fields: [rewardRedemptions.internalCustomerId],
		references: [customers.internalId]
	}),
	rewardProgram: one(rewardPrograms, {
		fields: [rewardRedemptions.internalRewardProgramId],
		references: [rewardPrograms.internalId]
	}),
	referralCode: one(referralCodes, {
		fields: [rewardRedemptions.referralCodeId],
		references: [referralCodes.id]
	}),
}));

export const referralCodesRelations = relations(referralCodes, ({one, many}) => ({
	rewardRedemptions: many(rewardRedemptions),
	customer: one(customers, {
		fields: [referralCodes.internalCustomerId],
		references: [customers.internalId]
	}),
	rewardProgram: one(rewardPrograms, {
		fields: [referralCodes.internalRewardProgramId],
		references: [rewardPrograms.internalId]
	}),
	organization: one(organizations, {
		fields: [referralCodes.orgId],
		references: [organizations.id]
	}),
}));

export const migrationJobsRelations = relations(migrationJobs, ({one, many}) => ({
	product_fromInternalProductId: one(products, {
		fields: [migrationJobs.fromInternalProductId],
		references: [products.internalId],
		relationName: "migrationJobs_fromInternalProductId_products_internalId"
	}),
	organization: one(organizations, {
		fields: [migrationJobs.orgId],
		references: [organizations.id]
	}),
	product_toInternalProductId: one(products, {
		fields: [migrationJobs.toInternalProductId],
		references: [products.internalId],
		relationName: "migrationJobs_toInternalProductId_products_internalId"
	}),
	migrationErrors: many(migrationErrors),
}));

export const subscriptionsRelations = relations(subscriptions, ({one}) => ({
	organization: one(organizations, {
		fields: [subscriptions.orgId],
		references: [organizations.id]
	}),
}));

export const migrationErrorsRelations = relations(migrationErrors, ({one}) => ({
	customer: one(customers, {
		fields: [migrationErrors.internalCustomerId],
		references: [customers.internalId]
	}),
	migrationJob: one(migrationJobs, {
		fields: [migrationErrors.migrationJobId],
		references: [migrationJobs.id]
	}),
}));