import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/index.js";
import { buildEntitySubjectScenario } from "./utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "./utils/withInsertedScenario.js";

describe(`${chalk.yellowBright("fullSubject ordering and limits")}`, () => {
	test("orders and limits customer products and loose entitlements per subject", async () => {
		const scenario = buildEntitySubjectScenario({
			ctx,
			name: "fullsubject-order-limit",
		});

		const baseTime = Date.now();
		const key = scenario.ids.internalCustomerId;
		const parentProduct = scenario.products[0]!;
		const entityProduct = scenario.products[1]!;
		const parentEntitlement = scenario.entitlements[0]!;
		const parentPrice = scenario.prices[0]!;
		const parentCustomerProduct = {
			...scenario.customerProducts[0]!,
			created_at: baseTime - 20_000,
			status: CusProductStatus.Active,
		};
		const entityCustomerProduct = {
			...scenario.customerProducts[1]!,
			created_at: baseTime - 100_000,
			status: CusProductStatus.Active,
		};
		const unrelatedEntityCustomerProduct = {
			...scenario.customerProducts[2]!,
			created_at: baseTime,
			status: CusProductStatus.Active,
		};

		const addOnProduct = {
			...parentProduct,
			internal_id: `${parentProduct.internal_id}_addon`,
			id: `${parentProduct.id}_addon`,
			name: `${parentProduct.name} Add-on`,
			is_add_on: true,
			created_at: baseTime,
		};
		const freeProduct = {
			...parentProduct,
			internal_id: `${parentProduct.internal_id}_free`,
			id: `${parentProduct.id}_free`,
			name: `${parentProduct.name} Free`,
			is_add_on: false,
			created_at: baseTime,
		};
		const expiredProduct = {
			...parentProduct,
			internal_id: `${parentProduct.internal_id}_expired`,
			id: `${parentProduct.id}_expired`,
			name: `${parentProduct.name} Expired`,
			is_add_on: false,
			created_at: baseTime,
		};

		const addOnEntitlement = {
			...parentEntitlement,
			id: `${parentEntitlement.id}_addon`,
			internal_product_id: addOnProduct.internal_id,
			created_at: baseTime,
		};
		const expiredEntitlement = {
			...parentEntitlement,
			id: `${parentEntitlement.id}_expired`,
			internal_product_id: expiredProduct.internal_id,
			created_at: baseTime,
		};
		const addOnPrice = {
			...parentPrice,
			id: `${parentPrice.id}_addon`,
			internal_product_id: addOnProduct.internal_id,
			entitlement_id: addOnEntitlement.id,
			created_at: baseTime,
		};
		const expiredPrice = {
			...parentPrice,
			id: `${parentPrice.id}_expired`,
			internal_product_id: expiredProduct.internal_id,
			entitlement_id: expiredEntitlement.id,
			created_at: baseTime,
		};

		const addOnCustomerProduct = {
			...parentCustomerProduct,
			id: `${parentCustomerProduct.id}_addon`,
			internal_product_id: addOnProduct.internal_id,
			product_id: addOnProduct.id,
			created_at: baseTime,
			status: CusProductStatus.Active,
		};
		const freeCustomerProduct = {
			...parentCustomerProduct,
			id: `${parentCustomerProduct.id}_free`,
			internal_product_id: freeProduct.internal_id,
			product_id: freeProduct.id,
			created_at: baseTime + 1_000,
			status: CusProductStatus.Active,
		};
		const expiredCustomerProduct = {
			...parentCustomerProduct,
			id: `${parentCustomerProduct.id}_expired`,
			internal_product_id: expiredProduct.internal_id,
			product_id: expiredProduct.id,
			created_at: baseTime + 2_000,
			status: CusProductStatus.Expired,
		};
		const addOnCustomerPrice = {
			...scenario.customerPrices[0]!,
			id: `${scenario.customerPrices[0]!.id}_addon`,
			customer_product_id: addOnCustomerProduct.id,
			price_id: addOnPrice.id,
			created_at: baseTime,
		};
		const expiredCustomerPrice = {
			...scenario.customerPrices[0]!,
			id: `${scenario.customerPrices[0]!.id}_expired`,
			customer_product_id: expiredCustomerProduct.id,
			price_id: expiredPrice.id,
			created_at: baseTime,
		};
		const addOnCustomerEntitlement = {
			...scenario.customerEntitlements[0]!,
			id: `${scenario.customerEntitlements[0]!.id}_addon`,
			customer_product_id: addOnCustomerProduct.id,
			entitlement_id: addOnEntitlement.id,
			created_at: baseTime,
			external_id: `${scenario.customerEntitlements[0]!.external_id}_addon`,
		};
		const expiredCustomerEntitlement = {
			...scenario.customerEntitlements[0]!,
			id: `${scenario.customerEntitlements[0]!.id}_expired`,
			customer_product_id: expiredCustomerProduct.id,
			entitlement_id: expiredEntitlement.id,
			created_at: baseTime,
			external_id: `${scenario.customerEntitlements[0]!.external_id}_expired`,
		};

		const fillerProducts = Array.from({ length: 55 }, (_, index) => {
			const suffix = index.toString().padStart(2, "0");
			return {
				...parentProduct,
				internal_id: `${parentProduct.internal_id}_filler_${suffix}`,
				id: `${parentProduct.id}_filler_${suffix}`,
				name: `${parentProduct.name} Filler ${suffix}`,
				is_add_on: false,
				created_at: baseTime - index,
			};
		});
		const fillerCustomerProducts = fillerProducts.map((product, index) => ({
			...parentCustomerProduct,
			id: `${parentCustomerProduct.id}_filler_${index
				.toString()
				.padStart(2, "0")}`,
			internal_product_id: product.internal_id,
			product_id: product.id,
			created_at: baseTime - index,
			status: CusProductStatus.Expired,
		}));

		const customerLooseEntitlements = Array.from({ length: 35 }, (_, index) => {
			const suffix = index.toString().padStart(2, "0");
			return {
				...scenario.customerEntitlements[0]!,
				id: `ce_${key}_loose_customer_${suffix}`,
				customer_product_id: null,
				entitlement_id: parentEntitlement.id,
				internal_entity_id: null,
				balance: index + 1,
				created_at: baseTime + index,
				external_id: `bal_${key}_loose_customer_${suffix}`,
			};
		});
		const entityLooseEntitlements = Array.from({ length: 2 }, (_, index) => {
			const suffix = index.toString().padStart(2, "0");
			return {
				...scenario.customerEntitlements[0]!,
				id: `ce_${key}_loose_entity_${suffix}`,
				customer_product_id: null,
				entitlement_id: parentEntitlement.id,
				internal_entity_id: scenario.ids.internalEntityIds[0]!,
				balance: index + 1,
				created_at: baseTime + index,
				external_id: `bal_${key}_loose_entity_${suffix}`,
			};
		});

		const orderingScenario = {
			...scenario,
			products: [
				parentProduct,
				entityProduct,
				scenario.products[2]!,
				addOnProduct,
				freeProduct,
				expiredProduct,
				...fillerProducts,
			],
			entitlements: [
				parentEntitlement,
				scenario.entitlements[1]!,
				scenario.entitlements[2]!,
				addOnEntitlement,
				expiredEntitlement,
			],
			prices: [
				parentPrice,
				scenario.prices[1]!,
				scenario.prices[2]!,
				addOnPrice,
				expiredPrice,
			],
			customerProducts: [
				parentCustomerProduct,
				entityCustomerProduct,
				unrelatedEntityCustomerProduct,
				addOnCustomerProduct,
				freeCustomerProduct,
				expiredCustomerProduct,
				...fillerCustomerProducts,
			],
			customerPrices: [
				scenario.customerPrices[0]!,
				scenario.customerPrices[1]!,
				scenario.customerPrices[2]!,
				addOnCustomerPrice,
				expiredCustomerPrice,
			],
			customerEntitlements: [
				scenario.customerEntitlements[0]!,
				scenario.customerEntitlements[1]!,
				scenario.customerEntitlements[2]!,
				addOnCustomerEntitlement,
				expiredCustomerEntitlement,
				...customerLooseEntitlements,
				...entityLooseEntitlements,
			],
			ids: {
				...scenario.ids,
				productInternalIds: [
					...scenario.ids.productInternalIds,
					addOnProduct.internal_id,
					freeProduct.internal_id,
					expiredProduct.internal_id,
					...fillerProducts.map((product) => product.internal_id),
				],
				productIds: [
					...scenario.ids.productIds,
					addOnProduct.id,
					freeProduct.id,
					expiredProduct.id,
					...fillerProducts.map((product) => product.id),
				],
			},
		};

		await withInsertedScenario({
			ctx,
			scenario: orderingScenario,
			run: async () => {
				const inStatuses = [CusProductStatus.Active, CusProductStatus.Expired];
				const customerSubject = (await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					inStatuses,
				}))!;
				const entitySubject = (await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					entityId: scenario.ids.entityIds[0],
					inStatuses,
				}))!;

				expect(customerSubject.customer_products).toHaveLength(50);
				expect(
					customerSubject.customer_products
						.slice(0, 4)
						.map((customerProduct) => customerProduct.id),
				).toEqual([
					parentCustomerProduct.id,
					addOnCustomerProduct.id,
					freeCustomerProduct.id,
					expiredCustomerProduct.id,
				]);

				expect(entitySubject.customer_products).toHaveLength(50);
				expect(
					entitySubject.customer_products
						.slice(0, 5)
						.map((customerProduct) => customerProduct.id),
				).toEqual([
					entityCustomerProduct.id,
					parentCustomerProduct.id,
					addOnCustomerProduct.id,
					freeCustomerProduct.id,
					expiredCustomerProduct.id,
				]);
				expect(
					entitySubject.customer_products.map(
						(customerProduct) => customerProduct.id,
					),
				).not.toContain(unrelatedEntityCustomerProduct.id);

				expect(customerSubject.extra_customer_entitlements).toHaveLength(30);
				expect(
					customerSubject.extra_customer_entitlements
						.slice(0, 3)
						.map((customerEntitlement) => customerEntitlement.id),
				).toEqual([
					`ce_${key}_loose_customer_34`,
					`ce_${key}_loose_customer_33`,
					`ce_${key}_loose_customer_32`,
				]);

				expect(entitySubject.extra_customer_entitlements).toHaveLength(30);
				expect(
					entitySubject.extra_customer_entitlements
						.slice(0, 4)
						.map((customerEntitlement) => customerEntitlement.id),
				).toEqual([
					`ce_${key}_loose_entity_01`,
					`ce_${key}_loose_entity_00`,
					`ce_${key}_loose_customer_34`,
					`ce_${key}_loose_customer_33`,
				]);
			},
		});
	});
});
