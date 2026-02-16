import { z } from "zod/v4";

export const entityDataParamsSchema = z.object({
	name: z.string().optional(),
	featureId: z.string(),
});

export const attachFeatureOptionsSchema = z.object({
	featureId: z.string(),
	quantity: z.number(),
});

export const attachParamsSchema = z.object({
	productId: z.string().optional(),
	entityId: z.string().optional(),
	options: z.array(attachFeatureOptionsSchema).optional(),
	productIds: z.array(z.string()).optional(),
	freeTrial: z.boolean().optional(),
	successUrl: z.string().optional(),
	metadata: z.record(z.string(), z.string()).optional(),
	forceCheckout: z.boolean().optional(),
	entityData: entityDataParamsSchema.optional(),
	openInNewTab: z.boolean().optional(),
	reward: z.string().optional(),
	checkoutSessionParams: z.record(z.string(), z.any()).optional(),
});

export const cancelParamsSchema = z.object({
	productId: z.string(),
	entityId: z.string().optional(),
	cancelImmediately: z.boolean().optional(),
});

export const checkParamsSchema = z.object({
	featureId: z.string().optional(),
	productId: z.string().optional(),
	entityId: z.string().optional(),
	requiredBalance: z.number().optional(),
	sendEvent: z.boolean().optional(),
	withPreview: z.boolean().optional(),
	entityData: entityDataParamsSchema.optional(),
});

export const trackParamsSchema = z.object({
	featureId: z.string().optional(),
	eventName: z.string().optional(),
	entityId: z.string().optional(),
	value: z.number().optional(),
	idempotencyKey: z.string().optional(),
	entityData: entityDataParamsSchema.optional(),
});

export const openBillingPortalParamsSchema = z.object({
	returnUrl: z.string().optional(),
	openInNewTab: z.boolean().optional(),
});

export const createReferralCodeParamsSchema = z.object({
	programId: z.string(),
});

export const redeemReferralCodeParamsSchema = z.object({
	code: z.string(),
});
