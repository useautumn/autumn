import { relations } from "drizzle-orm/relations";
import { rewards, rewardPrograms, organizations, customers, referralCodes, rewardRedemptions, customerPrices, invoiceItems, apiKeys, freeTrials, customerProducts, entities, products, prices, features, entitlements, events, migrationJobs, subscriptions, migrationErrors } from "./schema";

export const rewardProgramsRelations = relations(rewardPrograms, ({one, many}) => ({
	reward: one(rewards, {
		fields: [rewardPrograms.internalRewardId],
		references: [rewards.internalId]
	}),
	organization: one(organizations, {
		fields: [rewardPrograms.orgId],
		references: [organizations.id]
	}),
	referralCodes: many(referralCodes),
	rewardRedemptions: many(rewardRedemptions),
}));

export const rewardsRelations = relations(rewards, ({one, many}) => ({
	rewardPrograms: many(rewardPrograms),
	organization: one(organizations, {
		fields: [rewards.orgId],
		references: [organizations.id]
	}),
}));

export const organizationsRelations = relations(organizations, ({many}) => ({
	rewardPrograms: many(rewardPrograms),
	referralCodes: many(referralCodes),
	rewards: many(rewards),
	apiKeys: many(apiKeys),
	features: many(features),
	entities: many(entities),
	products: many(products),
	migrationJobs: many(migrationJobs),
	subscriptions: many(subscriptions),
}));

export const referralCodesRelations = relations(referralCodes, ({one, many}) => ({
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
	rewardRedemptions: many(rewardRedemptions),
}));

export const customersRelations = relations(customers, ({many}) => ({
	referralCodes: many(referralCodes),
	rewardRedemptions: many(rewardRedemptions),
	customerProducts: many(customerProducts),
	customerPrices: many(customerPrices),
	entities: many(entities),
	events: many(events),
	migrationErrors: many(migrationErrors),
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

export const invoiceItemsRelations = relations(invoiceItems, ({one}) => ({
	customerPrice: one(customerPrices, {
		fields: [invoiceItems.customerPriceId],
		references: [customerPrices.id]
	}),
}));

export const customerPricesRelations = relations(customerPrices, ({one, many}) => ({
	invoiceItems: many(invoiceItems),
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
}));

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
	organization: one(organizations, {
		fields: [apiKeys.orgId],
		references: [organizations.id]
	}),
}));

export const customerProductsRelations = relations(customerProducts, ({one, many}) => ({
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
	customerPrices: many(customerPrices),
}));

export const freeTrialsRelations = relations(freeTrials, ({one, many}) => ({
	customerProducts: many(customerProducts),
	product: one(products, {
		fields: [freeTrials.internalProductId],
		references: [products.internalId]
	}),
}));

export const entitiesRelations = relations(entities, ({one, many}) => ({
	customerProducts: many(customerProducts),
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
}));

export const productsRelations = relations(products, ({one, many}) => ({
	customerProducts: many(customerProducts),
	entitlements: many(entitlements),
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
	freeTrials: many(freeTrials),
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

export const featuresRelations = relations(features, ({one, many}) => ({
	organization: one(organizations, {
		fields: [features.orgId],
		references: [organizations.id]
	}),
	entities: many(entities),
	entitlements: many(entitlements),
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

export const eventsRelations = relations(events, ({one}) => ({
	customer: one(customers, {
		fields: [events.internalCustomerId],
		references: [customers.internalId]
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