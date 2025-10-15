// import { writeFileSync } from "node:fs";
// import yaml from "yaml";
// import { z } from "zod/v4";
// import { createDocument } from "zod-openapi";
// import { AttachBodySchema } from "../models/attachModels/attachBody.js";
// import { CusResponseSchema } from "../models/cusModels/cusResponseModels.js";

// const customerId = z.string().meta({
// 	description: "Your internal ID for the customer",
// 	example: "cus_123",
// 	id: "customer_id",
// });

// const featureId = z.string().meta({
// 	description: "Feature ID as defined in the dashboard (eg. 'messages')",
// 	example: "messages",
// 	id: "feature_id",
// });

// const AttachResult = z
// 	.object({
// 		message: z.string().meta({
// 			description: "A short description on the result of the operation",
// 			example: "Successfully downgraded from Product A to Product B",
// 			id: "message",
// 		}),
// 		product_ids: z.array(z.string()).meta({
// 			description: "The IDs of the products that were attached",
// 			example: ["pro", "one_off"],
// 			id: "product_ids",
// 		}),
// 		customer_id: customerId,
// 	})
// 	.meta({ id: "AttachResult" });

// const attachDefinition = {
// 	summary: "Attach Product",
// 	tags: ["core"],
// 	"x-speakeasy-name-override": "attach",
// 	requestBody: {
// 		content: {
// 			"application/json": { schema: AttachBodySchema },
// 		},
// 	},
// 	responses: {
// 		"200": {
// 			description: "200 OK",
// 			content: {
// 				"application/json": { schema: AttachResult },
// 			},
// 		},
// 	},
// };

// // Define Customer schema as a reusable component
// const CustomerV1 = CusResponseSchema.meta({ id: "Customer" });

// const document = createDocument({
// 	openapi: "3.1.0",
// 	info: {
// 		title: "My API",
// 		version: "1.0.0",
// 	},
// 	servers: [
// 		{
// 			url: "https://api.useautumn.com",
// 			description: "Production server",
// 		},
// 	],
// 	security: [
// 		{
// 			secretKey: [],
// 		},
// 	],
// 	components: {
// 		securitySchemes: {
// 			secretKey: {
// 				type: "http",
// 				scheme: "bearer",
// 				bearerFormat: "JWT",
// 			},
// 		},
// 	},

// 	paths: {
// 		"/core/attach": {
// 			post: attachDefinition,
// 		},
// 		"/customers/{customer_id}": {
// 			get: {
// 				summary: "Get customer",
// 				"x-speakeasy-name-override": "get",
// 				tags: ["customers"],
// 				requestParams: { path: z.object({ customer_id: customerId }) },
// 				responses: {
// 					"200": {
// 						description: "200 OK",
// 						content: {
// 							"application/json": { schema: CustomerV1 },
// 						},
// 					},
// 				},
// 			},
// 		},
// 		"/customers/{customer_id}/features/{feature_id}": {
// 			patch: {
// 				summary: "Update customer feature",
// 				tags: ["customer.features"],
// 				"x-speakeasy-name-override": "update",
// 				requestParams: {
// 					path: z.object({ customer_id: customerId, feature_id: featureId }),
// 				},
// 				requestBody: {
// 					content: {
// 						"application/json": {
// 							schema: z.object({
// 								usage: z.number(),
// 							}),
// 						},
// 					},
// 				},
// 				responses: {
// 					"200": {
// 						description: "200 OK",
// 						content: {
// 							"application/json": {
// 								schema: z.object({
// 									usage: z.number(),
// 								}),
// 							},
// 						},
// 					},
// 				},
// 			},
// 		},
// 	},
// });

// // Export to YAML file during build
// if (process.env.NODE_ENV !== "production") {
// 	try {
// 		const yamlContent = yaml.stringify(document);
// 		writeFileSync("./openapi.yaml", yamlContent, "utf8");
// 		console.log("OpenAPI document exported to openapi-customer.yaml");
// 	} catch (error) {
// 		console.error("Failed to export OpenAPI document:", error);
// 	}
// }
