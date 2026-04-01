import { AppEnv } from "@autumn/shared";
import type { SubjectCoreRow } from "@server/internal/customers/repos/getFullSubject.js";
import { resultToFullCustomer } from "@server/internal/customers/repos/getFullCustomerV2/resultToFullCustomer.js";
import { getSubjectCoreQuery } from "@server/internal/customers/repos/sql/getSubjectCoreQuery.js";
import { filterCusProductsByEntity } from "@shared/utils/cusProductUtils/filterCusProductUtils.js";
import { logFullCustomer } from "@shared/utils/cusUtils/fullCusUtils/logFullCustomer.js";
import Redis from "ioredis";
import {
    initDrizzle,
    prodTestCustomerId,
    prodTestEntityId,
    prodTestOrgId,
} from "./experimentEnv";

const ORG_ID = prodTestOrgId;
const ENV = AppEnv.Live;
const CUSTOMER_ID = prodTestCustomerId;
const ENTITY_ID = prodTestEntityId;

async function main() {
	const redis = new Redis(process.env.CACHE_URL!);
	const { db, client } = initDrizzle({ maxConnections: 2 });

	try {
		// 1. Run entity-scoped V2 query (current behavior: entity products only)
		const entityQuery = getSubjectCoreQuery({
			orgId: ORG_ID,
			env: ENV,
			customerId: CUSTOMER_ID,
			entityId: ENTITY_ID,
		});

		console.log("=== Full Entity V2 Experiment ===");
		console.log(`  orgId:      ${ORG_ID}`);
		console.log(`  env:        ${ENV}`);
		console.log(`  customerId: ${CUSTOMER_ID}`);
		console.log(`  entityId:   ${ENTITY_ID}`);
		console.log("");

		const entityStart = performance.now();
		const entityResult = await db.execute(entityQuery);
		const entityQueryMs = (performance.now() - entityStart).toFixed(2);

		if (!entityResult || entityResult.length === 0) {
			console.log("No entity found.");
			return;
		}

		const entityRow = entityResult[0] as unknown as SubjectCoreRow;
		const entityHydrateStart = performance.now();
		const entityFullCustomer = resultToFullCustomer({ row: entityRow });
		const entityHydrateMs = (performance.now() - entityHydrateStart).toFixed(2);

		const entityJson = JSON.stringify(entityFullCustomer);
		const entitySizeBytes = Buffer.byteLength(entityJson, "utf8");
		const entitySizeKb = (entitySizeBytes / 1024).toFixed(2);

		await redis.call("JSON.SET", `entity-hydrated-${ENTITY_ID}`, "$", entityJson);

		const normalizedDoc = JSON.stringify(entityRow);
		const normalizedSizeBytes = Buffer.byteLength(normalizedDoc, "utf8");
		const normalizedSizeKb = (normalizedSizeBytes / 1024).toFixed(2);
		await redis.call("JSON.SET", `entity-normalized-${ENTITY_ID}`, "$", normalizedDoc);

		console.log("--- Entity-scoped query (entity products only) ---");
		console.log(`  Query:     ${entityQueryMs}ms`);
		console.log(`  Hydration: ${entityHydrateMs}ms`);
		console.log(`  Hydrated JSON size:    ${entitySizeKb} KB (${entitySizeBytes} bytes)`);
		console.log(`  Normalized JSON size:  ${normalizedSizeKb} KB (${normalizedSizeBytes} bytes)`);
		console.log(`  Savings:               ${(100 - (normalizedSizeBytes / entitySizeBytes) * 100).toFixed(1)}%`);
		console.log(`  Products:  ${entityFullCustomer.customer_products.length}`);
		console.log(
			`  CusEnts:   ${entityFullCustomer.customer_products.reduce((sum, cp) => sum + cp.customer_entitlements.length, 0)}`,
		);
		console.log(
			`  Extra CusEnts: ${entityFullCustomer.extra_customer_entitlements.length}`,
		);
		console.log("");

		// 2. Run customer-level V2 query (no entityId — bounded customer)
		const customerQuery = getSubjectCoreQuery({
			orgId: ORG_ID,
			env: ENV,
			customerId: CUSTOMER_ID,
		});

		const customerStart = performance.now();
		const customerResult = await db.execute(customerQuery);
		const customerQueryMs = (performance.now() - customerStart).toFixed(2);

		const customerRow = customerResult[0] as unknown as SubjectCoreRow;
		const customerHydrateStart = performance.now();
		const customerFullCustomer = resultToFullCustomer({ row: customerRow });
		const customerHydrateMs = (
			performance.now() - customerHydrateStart
		).toFixed(2);

		const customerJson = JSON.stringify(customerFullCustomer);
		const customerSizeBytes = Buffer.byteLength(customerJson, "utf8");
		const customerSizeKb = (customerSizeBytes / 1024).toFixed(2);

		console.log("--- Customer-level query (no entity filter) ---");
		console.log(`  Query:     ${customerQueryMs}ms`);
		console.log(`  Hydration: ${customerHydrateMs}ms`);
		console.log(
			`  JSON size: ${customerSizeKb} KB (${customerSizeBytes} bytes)`,
		);
		console.log(
			`  Products:  ${customerFullCustomer.customer_products.length}`,
		);
		console.log(
			`  Entities:  ${customerFullCustomer.entities?.length ?? 0}`,
		);
		console.log("");

		// 3. Simulate what a FullEntity would look like (entity products + inherited customer-level)
		const entity = customerFullCustomer.entities?.find(
			(e) => e.id === ENTITY_ID || e.internal_id === ENTITY_ID,
		);

		if (entity) {
			const inheritedProducts = filterCusProductsByEntity({
				cusProducts: customerFullCustomer.customer_products,
				entity,
			});

			const inheritedJson = JSON.stringify({
				customer: {
					id: customerFullCustomer.id,
					internal_id: customerFullCustomer.internal_id,
					processor: customerFullCustomer.processor,
				},
				entity,
				customer_products: inheritedProducts,
				extra_customer_entitlements:
					customerFullCustomer.extra_customer_entitlements,
			});
			const inheritedSizeBytes = Buffer.byteLength(inheritedJson, "utf8");
			const inheritedSizeKb = (inheritedSizeBytes / 1024).toFixed(2);

			const customerLevelProducts = inheritedProducts.filter(
				(p) => !p.internal_entity_id,
			);
			const entityScopedProducts = inheritedProducts.filter(
				(p) => p.internal_entity_id,
			);

			console.log(
				"--- Simulated FullEntity (entity + inherited customer products) ---",
			);
			console.log(
				`  JSON size:              ${inheritedSizeKb} KB (${inheritedSizeBytes} bytes)`,
			);
			console.log(`  Total products:         ${inheritedProducts.length}`);
			console.log(
				`  Customer-level (inherited): ${customerLevelProducts.length}`,
			);
			console.log(
				`  Entity-scoped (own):       ${entityScopedProducts.length}`,
			);
			console.log("");

			
		} else {
			console.log(
				`Entity ${ENTITY_ID} not found in customer's entities array.`,
			);
		}

		// 4. Size breakdown by category
		console.log("--- Size breakdown (customer-level query) ---");
		const breakdown = {
			customer_core: Buffer.byteLength(
				JSON.stringify({
					id: customerFullCustomer.id,
					internal_id: customerFullCustomer.internal_id,
					name: customerFullCustomer.name,
					email: customerFullCustomer.email,
					processor: customerFullCustomer.processor,
				}),
				"utf8",
			),
			entities_array: Buffer.byteLength(
				JSON.stringify(customerFullCustomer.entities ?? []),
				"utf8",
			),
			customer_products: Buffer.byteLength(
				JSON.stringify(customerFullCustomer.customer_products),
				"utf8",
			),
			extra_customer_entitlements: Buffer.byteLength(
				JSON.stringify(customerFullCustomer.extra_customer_entitlements),
				"utf8",
			),
			aggregated_customer_products: Buffer.byteLength(
				JSON.stringify(
					(customerFullCustomer as Record<string, unknown>)
						.aggregated_customer_products ?? [],
				),
				"utf8",
			),
			aggregated_customer_entitlements: Buffer.byteLength(
				JSON.stringify(
					(customerFullCustomer as Record<string, unknown>)
						.aggregated_customer_entitlements ?? [],
				),
				"utf8",
			),
		};

		for (const [key, bytes] of Object.entries(breakdown)) {
			console.log(`  ${key}: ${(bytes / 1024).toFixed(2)} KB`);
		}
		console.log(
			`  TOTAL: ${(Object.values(breakdown).reduce((a, b) => a + b, 0) / 1024).toFixed(2)} KB`,
		);
		console.log("");

		// 5. Per-product size stats
		const productSizes = customerFullCustomer.customer_products.map((cp) => ({
			productId: cp.product_id,
			entityId: cp.internal_entity_id ?? "(customer-level)",
			sizeBytes: Buffer.byteLength(JSON.stringify(cp), "utf8"),
			entitlements: cp.customer_entitlements.length,
			prices: cp.customer_prices.length,
		}));
		productSizes.sort((a, b) => b.sizeBytes - a.sizeBytes);

		console.log(
			`--- Top 10 largest products (of ${productSizes.length} total) ---`,
		);
		for (const p of productSizes.slice(0, 10)) {
			console.log(
				`  ${p.productId} [${p.entityId}]: ${(p.sizeBytes / 1024).toFixed(2)} KB (${p.entitlements} ents, ${p.prices} prices)`,
			);
		}

		console.log("");
		logFullCustomer({ fullCustomer: customerFullCustomer });
	} finally {
		await redis.quit();
		await client.end();
	}
}

main().catch(console.error);
