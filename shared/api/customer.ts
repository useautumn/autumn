import { writeFileSync } from "node:fs";
import yaml from "yaml";
import { z } from "zod/v4";
import { createDocument } from "zod-openapi";
import { AttachBodySchema } from "../models/attachModels/attachBody.js";
import { CusResponseSchema } from "../models/cusModels/cusResponseModels.js";

const customerId = z.string().meta({
	description: "Your internal ID for the customer",
	example: "cus_123",
	id: "customerId",
});

const featureId = z.string().meta({
	description: "Feature ID as defined in the dashboard (eg. 'messages')",
	example: "messages",
	id: "featureId",
});

const AttachResult = z
	.object({
		message: z.string().meta({
			description: "A short description on the result of the operation",
			example: "Successfully downgraded from Product A to Product B",
			id: "message",
		}),
		product_ids: z.array(z.string()).meta({
			description: "The IDs of the products that were attached",
			example: ["pro", "one_off"],
			id: "productIds",
		}),
		customer_id: customerId,
	})
	.meta({ id: "AttachResult" });

const attachDefinition = {
	// requestParams: { path: z.object({ customerId }) },
	requestBody: {
		content: {
			"application/json": { schema: AttachBodySchema },
		},
	},
	responses: {
		"200": {
			description: "200 OK",
			content: {
				"application/json": { schema: AttachResult },
			},
		},
	},
};

// Define Customer schema as a reusable component
const CustomerV1 = CusResponseSchema.meta({ id: "Customer" });

const document = createDocument({
	openapi: "3.1.0",
	info: {
		title: "My API",
		version: "1.0.0",
	},
	security: [
		{
			secretKey: [],
		},
	],
	components: {
		securitySchemes: {
			secretKey: {
				type: "http",
				scheme: "bearer",
				bearerFormat: "JWT",
			},
		},
	},
	paths: {
		"/customers/{customerId}": {
			get: {
				requestParams: { path: z.object({ customerId }) },
				responses: {
					"200": {
						description: "200 OK",
						content: {
							"application/json": { schema: CustomerV1 },
						},
					},
				},
			},
		},
		"/customers/{customerId}/features/{featureId}": {
			patch: {
				tags: ["customers.features"],
				requestParams: { path: z.object({ customerId, featureId }) },
				"x-speakeasy-name-override": "update",
				requestBody: {
					content: {
						"application/json": {
							schema: z.object({
								usage: z.number(),
							}),
						},
					},
				},
				responses: {
					"200": {
						description: "200 OK",
						content: {
							"application/json": {
								schema: z.object({
									usage: z.number(),
								}),
							},
						},
					},
				},
			},
		},
		"/core/attach": { post: attachDefinition },
	},
});

// Export to YAML file during build
if (process.env.NODE_ENV !== "production") {
	try {
		const yamlContent = yaml.stringify(document);
		writeFileSync("./openapi.yaml", yamlContent, "utf8");
		console.log("OpenAPI document exported to openapi-customer.yaml");
	} catch (error) {
		console.error("Failed to export OpenAPI document:", error);
	}
}
