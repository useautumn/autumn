import {
	MintKeyParamsSchema,
	MintKeyResponseSchema,
	RefreshKeyParamsSchema,
	RefreshKeyResponseSchema,
	RevokeKeyParamsSchema,
	RevokeKeyResponseSchema,
} from "@api/keys/keysModels.js";
import { oc } from "@orpc/contract";
import {
	mintKeyJsDoc,
	refreshKeyJsDoc,
	revokeKeyJsDoc,
} from "../jsDocs/keysJsDocs";

export const keysMintContract = oc
	.route({
		method: "POST",
		path: "/v1/keys.mint",
		operationId: "mintKey",
		tags: ["keys"],
		description: mintKeyJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "mint",
		}),
	})
	.input(
		MintKeyParamsSchema.meta({
			title: "MintKeyParams",
			examples: [{ customer_id: "cus_123" }],
		}),
	)
	.output(
		MintKeyResponseSchema.meta({
			examples: [
				{
					access_token: "am_jwt_eyJhbGciOiJIUzI1NiJ9...",
					refresh_token: "am_jwt_eyJhbGciOiJIUzI1NiJ9...",
					expires_at: 1781113864000,
					refresh_expires_at: 1781196664000,
				},
			],
		}),
	);

export const keysRefreshContract = oc
	.route({
		method: "POST",
		path: "/v1/keys.refresh",
		operationId: "refreshKey",
		tags: ["keys"],
		description: refreshKeyJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "refresh",
		}),
	})
	.input(
		RefreshKeyParamsSchema.meta({ title: "RefreshKeyParams", examples: [{}] }),
	)
	.output(
		RefreshKeyResponseSchema.meta({
			examples: [
				{
					access_token: "am_jwt_eyJhbGciOiJIUzI1NiJ9...",
					refresh_token: "am_jwt_eyJhbGciOiJIUzI1NiJ9...",
					expires_at: 1781113864000,
					refresh_expires_at: 1781196664000,
				},
			],
		}),
	);

export const keysRevokeContract = oc
	.route({
		method: "POST",
		path: "/v1/keys.revoke",
		operationId: "revokeKey",
		tags: ["keys"],
		description: revokeKeyJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "revoke",
		}),
	})
	.input(
		RevokeKeyParamsSchema.meta({
			title: "RevokeKeyParams",
			examples: [{ customer_id: "cus_123" }],
		}),
	)
	.output(RevokeKeyResponseSchema.meta({ examples: [{ revoked: true }] }));
