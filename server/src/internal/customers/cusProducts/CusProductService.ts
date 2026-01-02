import {
	type AppEnv,
	type CusProduct,
	CusProductStatus,
	customerProducts,
	customers,
	ErrCode,
	type FullCusProduct,
	InternalError,
	products,
	RecaseError,
} from "@autumn/shared";
import { and, arrayContains, eq, inArray, isNotNull, or } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const ACTIVE_STATUSES = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
];

export const RELEVANT_STATUSES = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Scheduled,
];

export const orgOwnsCusProduct = async ({
	cusProduct,
	orgId,
	env,
}: {
	cusProduct: FullCusProduct;
	orgId: string;
	env: AppEnv;
}) => {
	if (!cusProduct.product) return false;
	const product = cusProduct.product;

	if (product.org_id !== orgId || product.env !== env) {
		return false;
	}

	return true;
};

export const filterByOrgAndEnv = ({
	cusProducts,
	orgId,
	env,
}: {
	cusProducts: FullCusProduct[];
	orgId: string;
	env: AppEnv;
}) => {
	return cusProducts.filter((cusProduct) => {
		if (!cusProduct.product) return false;
		const product = cusProduct.product;

		if (product.org_id !== orgId || product.env !== env) {
			return false;
		}

		return true;
	});
};

const getFullCusProdRelations = () => {
	return {
		customer_entitlements: {
			with: {
				entitlement: {
					with: {
						feature: true as const,
					},
				},
				replaceables: true,
				rollovers: true,
			},
		},
		customer_prices: {
			with: {
				price: true as const,
			},
		},
		free_trial: true as const,
	} as const;
};

export class CusProductService {
	static async getByIdForReset({ db, id }: { db: DrizzleCli; id: string }) {
		const cusProduct = await db.query.customerProducts.findFirst({
			where: eq(customerProducts.id, id),
			with: {
				customer: true,
				product: {
					with: {
						org: true,
					},
				},
			},
		});

		if (!cusProduct) {
			throw new RecaseError({
				message: `Cus product not found: ${id}`,
				code: ErrCode.CusProductNotFound,
				statusCode: 404,
			});
		}

		return cusProduct;
	}

	static async get({
		db,
		id,
		orgId,
		env,
		withCustomer = false,
	}: {
		db: DrizzleCli;
		id: string;
		orgId: string;
		env: AppEnv;
		withCustomer?: boolean;
	}) {
		const cusProduct = (await db.query.customerProducts.findFirst({
			where: eq(customerProducts.id, id),
			with: {
				customer: withCustomer ? true : undefined,
				product: true,
				customer_entitlements: {
					with: {
						entitlement: {
							with: {
								feature: true,
							},
						},
						replaceables: true,
						rollovers: true,
					},
				},
				customer_prices: {
					with: {
						price: true,
					},
				},
				free_trial: true,
			},
		})) as FullCusProduct;

		if (!cusProduct || !orgOwnsCusProduct({ cusProduct, orgId, env })) {
			return null;
		}

		return cusProduct;
	}

	static async insert({
		db,
		data,
	}: {
		db: DrizzleCli;
		data: CusProduct[] | CusProduct;
	}) {
		if (Array.isArray(data) && data.length === 0) {
			return;
		}

		await db.insert(customerProducts).values(data as any);
	}

	static async list({
		db,
		internalCustomerId,
		withCustomer = false,
		inStatuses = [
			CusProductStatus.Active,
			CusProductStatus.PastDue,
			CusProductStatus.Scheduled,
		],
	}: {
		db: DrizzleCli;
		internalCustomerId: string;
		withCustomer?: boolean;
		inStatuses?: string[];
	}): Promise<FullCusProduct[]> {
		const cusProducts = await db.query.customerProducts.findMany({
			where: and(
				eq(customerProducts.internal_customer_id, internalCustomerId),
				inStatuses ? inArray(customerProducts.status, inStatuses) : undefined,
			),
			with: {
				customer: withCustomer ? true : undefined,
				product: true,
				customer_entitlements: {
					with: {
						entitlement: {
							with: {
								feature: true,
							},
						},
						replaceables: true,
						rollovers: true,
					},
				},
				customer_prices: {
					with: {
						price: true,
					},
				},
				free_trial: true,
			},
		});

		return cusProducts as FullCusProduct[];
	}

	static async getByInternalProductId({
		db,
		internalProductId,
		limit = 1,
	}: {
		db: DrizzleCli;
		internalProductId: string;
		limit?: number;
	}) {
		const data = await db.query.customerProducts.findMany({
			where: eq(customerProducts.internal_product_id, internalProductId),
			limit,
		});

		return data as CusProduct[];
	}

	static async getByProductId({
		db,
		productId,
		orgId,
		env,
		limit = 1,
	}: {
		db: DrizzleCli;
		productId: string;
		orgId: string;
		env: AppEnv;
		limit?: number;
	}) {
		const data = await db
			.select()
			.from(customerProducts)
			.innerJoin(
				products,
				eq(customerProducts.internal_product_id, products.internal_id),
			)
			.where(
				and(
					eq(products.id, productId),
					eq(products.org_id, orgId),
					eq(products.env, env),
				),
			)
			.limit(1);

		return data.map((d) => ({
			...d.customer_products,
			product: d.products,
		}));
	}

	static async getByStripeSubId({
		db,
		stripeSubId,
		orgId,
		env,
		inStatuses,
	}: {
		db: DrizzleCli;
		stripeSubId: string;
		orgId: string;
		env: AppEnv;
		inStatuses?: string[];
	}) {
		// sql`${customerProducts.subscription_ids} @> ${sql`ARRAY[${stripeSubId}]`}`,
		const data = await db.query.customerProducts.findMany({
			where: (table, { and, or, inArray }) =>
				and(
					or(arrayContains(customerProducts.subscription_ids, [stripeSubId])),
					inStatuses ? inArray(customerProducts.status, inStatuses) : undefined,
				),

			with: {
				product: true,
				customer: true,
				customer_entitlements: {
					with: {
						entitlement: {
							with: {
								feature: true,
							},
						},
						replaceables: true,
						rollovers: true,
					},
				},
				customer_prices: {
					with: {
						price: true,
					},
				},
				free_trial: true,
			},
		});

		const cusProducts = data as FullCusProduct[];

		return filterByOrgAndEnv({
			cusProducts,
			orgId,
			env,
		});
	}

	static async getByStripeScheduledId({
		db,
		stripeScheduledId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		stripeScheduledId: string;
		orgId: string;
		env: AppEnv;
	}) {
		const data = await db.query.customerProducts.findMany({
			where: (customerProducts, { and, or, eq, sql }) =>
				and(
					or(
						eq(
							sql`${customerProducts.processor}->>'subscription_schedule_id'`,
							stripeScheduledId,
						),
						sql`${customerProducts.scheduled_ids} @> ${sql`ARRAY[${stripeScheduledId}]`}`,
					),
				),

			with: {
				product: true,
				customer: true,
				customer_entitlements: {
					with: {
						entitlement: {
							with: {
								feature: true,
							},
						},
						replaceables: true,
						rollovers: true,
					},
				},
				customer_prices: {
					with: {
						price: true,
					},
				},
				free_trial: true,
			},
		});

		const cusProducts = data as FullCusProduct[];

		return filterByOrgAndEnv({
			cusProducts,
			orgId,
			env,
		});
	}

	static async getByScheduleId({
		db,
		scheduleId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		scheduleId: string;
		orgId: string;
		env: AppEnv;
	}) {
		const fullCusProdRelations = {
			customer_entitlements: {
				with: {
					entitlement: {
						with: {
							feature: true as const,
						},
					},
					replaceables: true,
					rollovers: true,
				},
			},
			customer_prices: {
				with: {
					price: true as const,
				},
			},
			free_trial: true as const,
		} as const;

		const data = (await db.query.customerProducts.findMany({
			where: arrayContains(customerProducts.scheduled_ids, [scheduleId]),
			with: {
				product: true,
				customer: true,
				...fullCusProdRelations,
			},
		})) as FullCusProduct[];

		return filterByOrgAndEnv({
			cusProducts: data,
			orgId,
			env,
		});
	}

	static async update({
		db,
		cusProductId,
		updates,
	}: {
		db: DrizzleCli;
		cusProductId: string;
		updates: Partial<CusProduct>;
	}) {
		return await db
			.update(customerProducts)
			.set(updates as any)
			.where(eq(customerProducts.id, cusProductId))
			.returning();
	}

	static async updateByStripeSubId({
		db,
		stripeSubId,
		updates,
		inStatuses = RELEVANT_STATUSES,
	}: {
		db: DrizzleCli;
		stripeSubId: string;
		updates: Partial<CusProduct>;
		inStatuses?: string[];
	}) {
		const updated = await db
			.update(customerProducts)
			.set(updates)
			.where(
				and(
					arrayContains(customerProducts.subscription_ids, [stripeSubId]),
					inStatuses ? inArray(customerProducts.status, inStatuses) : undefined,
				),
			)
			.returning({
				id: customerProducts.id,
			});

		const fullUpdated = (await db.query.customerProducts.findMany({
			where: inArray(
				customerProducts.id,
				updated.map((u) => u.id),
			),
			with: {
				product: true,
				customer: true,
				...getFullCusProdRelations(),
			},
		})) as FullCusProduct[];

		return fullUpdated as FullCusProduct[];
	}
	static async updateByStripeScheduledId({
		db,
		stripeScheduledId,
		updates,
	}: {
		db: DrizzleCli;
		stripeScheduledId: string;
		updates: Partial<CusProduct>;
	}) {
		const updated = await db
			.update(customerProducts)
			.set(updates as any)
			.where(
				and(
					arrayContains(customerProducts.scheduled_ids, [stripeScheduledId]),
					or(
						eq(customerProducts.status, CusProductStatus.Active),
						eq(customerProducts.status, CusProductStatus.PastDue),
						eq(customerProducts.status, CusProductStatus.Scheduled),
					),
				),
			)
			.returning({
				id: customerProducts.id,
			});

		const fullUpdated = (await db.query.customerProducts.findMany({
			where: inArray(
				customerProducts.id,
				updated.map((u) => u.id),
			),
			with: {
				product: true,
				customer: true,
				...getFullCusProdRelations(),
			},
		})) as FullCusProduct[];

		return fullUpdated as FullCusProduct[];
	}

	static async delete({
		db,
		cusProductId,
	}: {
		db: DrizzleCli;
		cusProductId: string;
	}) {
		return await db
			.delete(customerProducts)
			.where(eq(customerProducts.id, cusProductId))
			.returning();
	}

	static async getByFingerprint({
		db,
		productId,
		internalCustomerId,
		fingerprint,
	}: {
		db: DrizzleCli;
		productId: string;
		internalCustomerId: string;
		fingerprint?: string;
	}) {
		const data = await db
			.select()
			.from(customerProducts)
			.innerJoin(
				customers,
				eq(customerProducts.internal_customer_id, customers.internal_id),
			)
			.innerJoin(
				products,
				eq(customerProducts.internal_product_id, products.internal_id),
			)
			.where(
				and(
					or(
						fingerprint ? eq(customers.fingerprint, fingerprint) : undefined,
						eq(customers.internal_id, internalCustomerId),
					),
					eq(products.id, productId),
					isNotNull(customerProducts.free_trial_id),
				),
			);

		return data;
	}

	static async getByTrialAndCustomer({
		db,
		freeTrialId,
		internalCustomerId,
	}: {
		db: DrizzleCli;
		freeTrialId: string;
		internalCustomerId: string;
	}) {
		const data = await db.query.customerProducts.findMany({
			where: and(
				eq(customerProducts.free_trial_id, freeTrialId),
				eq(customerProducts.internal_customer_id, internalCustomerId),
			),
			with: {
				customer: true,
			},
		});

		return data;
	}

	static async deleteByProduct({
		db,
		productId,
		internalProductId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		productId?: string;
		internalProductId?: string;
		orgId: string;
		env: AppEnv;
	}) {
		if (productId) {
			const res = await db
				.select({
					internal_id: products.internal_id,
				})
				.from(products)
				.where(
					and(
						eq(products.id, productId),
						eq(products.org_id, orgId),
						eq(products.env, env),
					),
				);

			const internalProductIds = res.map((r) => r.internal_id);

			if (internalProductIds.length > 100) {
				throw new InternalError({
					message:
						"Can't delete by product when internal product ids length > 100",
				});
			}

			await db
				.delete(customerProducts)
				.where(
					inArray(customerProducts.internal_product_id, internalProductIds),
				);
		} else {
			await db
				.delete(customerProducts)
				.where(eq(customerProducts.internal_product_id, internalProductId!));
		}
	}
}
