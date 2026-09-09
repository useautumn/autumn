import {
	CreateSandboxKeyParamsSchema,
	CreateSandboxKeyResponseSchema,
	CreateSandboxParamsSchema,
	CreateSandboxResponseSchema,
	DeleteSandboxParamsSchema,
	DeleteSandboxResponseSchema,
	ListSandboxesParamsSchema,
	ListSandboxesResponseSchema,
	ResetSandboxParamsSchema,
	ResetSandboxResponseSchema,
} from "@api/sandboxes/sandboxesModels.js";
import { oc } from "@orpc/contract";
import {
	createSandboxJsDoc,
	createSandboxKeyJsDoc,
	deleteSandboxJsDoc,
	listSandboxesJsDoc,
	resetSandboxJsDoc,
} from "../jsDocs/sandboxesJsDocs";

const sandboxExample = {
	id: "org_123",
	name: "staging",
	slug: "staging-abc123|org_456",
	created_at: 1781113864000,
	color: "blue",
	icon: "Flask",
};

export const createSandboxContract = oc
	.route({
		method: "POST",
		path: "/v1/sandboxes.create",
		operationId: "createSandbox",
		tags: ["sandboxes"],
		description: createSandboxJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "create",
		}),
	})
	.input(
		CreateSandboxParamsSchema.meta({
			title: "CreateSandboxParams",
			examples: [{ name: "staging", color: "blue", icon: "Flask" }],
		}),
	)
	.output(
		CreateSandboxResponseSchema.meta({
			title: "CreateSandboxResponse",
			examples: [{ ...sandboxExample, secret_key: "am_sk_test_abc123" }],
		}),
	);

export const listSandboxesContract = oc
	.route({
		method: "POST",
		path: "/v1/sandboxes.list",
		operationId: "listSandboxes",
		tags: ["sandboxes"],
		description: listSandboxesJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "list",
		}),
	})
	.input(
		ListSandboxesParamsSchema.meta({
			title: "ListSandboxesParams",
			examples: [{}],
		}),
	)
	.output(
		ListSandboxesResponseSchema.meta({
			title: "ListSandboxesResponse",
			examples: [{ list: [sandboxExample] }],
		}),
	);

export const deleteSandboxContract = oc
	.route({
		method: "POST",
		path: "/v1/sandboxes.delete",
		operationId: "deleteSandbox",
		tags: ["sandboxes"],
		description: deleteSandboxJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "delete",
		}),
	})
	.input(
		DeleteSandboxParamsSchema.meta({
			title: "DeleteSandboxParams",
			examples: [{ id: "org_123" }],
		}),
	)
	.output(
		DeleteSandboxResponseSchema.meta({
			title: "DeleteSandboxResponse",
			examples: [{ success: true }],
		}),
	);

export const createSandboxKeyContract = oc
	.route({
		method: "POST",
		path: "/v1/sandboxes.create_key",
		operationId: "createSandboxKey",
		tags: ["sandboxes"],
		description: createSandboxKeyJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "createKey",
		}),
	})
	.input(
		CreateSandboxKeyParamsSchema.meta({
			title: "CreateSandboxKeyParams",
			examples: [{ id: "org_123" }],
		}),
	)
	.output(
		CreateSandboxKeyResponseSchema.meta({
			title: "CreateSandboxKeyResponse",
			examples: [
				{
					id: "org_123",
					name: "staging",
					slug: "staging-abc123|org_456",
					secret_key: "am_sk_test_abc123",
				},
			],
		}),
	);

export const resetSandboxContract = oc
	.route({
		method: "POST",
		path: "/v1/sandboxes.reset",
		operationId: "resetSandbox",
		tags: ["sandboxes"],
		description: resetSandboxJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "reset",
		}),
	})
	.input(
		ResetSandboxParamsSchema.meta({
			title: "ResetSandboxParams",
			examples: [{}],
		}),
	)
	.output(
		ResetSandboxResponseSchema.meta({
			title: "ResetSandboxResponse",
			examples: [{ success: true }],
		}),
	);
