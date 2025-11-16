import {
	AppEnv,
	ErrCode,
	type Organization,
	type Product,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import RecaseError from "@/utils/errorUtils.js";

export const createStripeProduct = async (
	org: Organization,
	env: AppEnv,
	product: Product,
) => {
	try {
		const stripe = createStripeCli({ org, env });

		const stripeProduct = await stripe.products.create({
			name: product.name,
			metadata: {
				autumn_id: product.id,
				autumn_internal_id: product.internal_id,
			},
		});

		return stripeProduct;
	} catch (error: any) {
		throw new RecaseError({
			message: `Error creating product in Stripe. ${error.message}`,
			code: ErrCode.CreateStripeProductFailed,
			statusCode: 500,
		});
	}
};

export const deleteStripeProduct = async (
	org: Organization,
	env: AppEnv,
	product: Product,
) => {
	const stripe = createStripeCli({ org, env });

	if (
		!product.processor ||
		!product.processor.id ||
		product.env === AppEnv.Live
	) {
		// Don't delete live products
		return;
	}

	try {
		await stripe.products.del(product.processor.id);
	} catch (_error) {
		throw new RecaseError({
			message: "Failed to delete stripe product",
			code: ErrCode.DeleteStripeProductFailed,
			statusCode: 500,
		});
	}
};

export const deactivateStripeMeters = async ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => {
	const stripeCli = createStripeCli({ org, env });

	const allStripeMeters = [];
	let hasMore = true;
	let startingAfter;

	while (hasMore) {
		const response: any = await stripeCli.billing.meters.list({
			limit: 100,
			status: "active",
			starting_after: startingAfter,
		});

		allStripeMeters.push(...response.data);
		hasMore = response.has_more;

		if (hasMore && response.data.length > 0) {
			startingAfter = response.data[response.data.length - 1].id;
		}
	}

	const batchSize = 20;
	for (let i = 0; i < allStripeMeters.length; i += batchSize) {
		const batch = allStripeMeters.slice(i, i + batchSize);
		await Promise.all(
			batch.map((meter) => stripeCli.billing.meters.deactivate(meter.id)),
		);
		console.log(
			`Deactivated ${i + batch.length}/${allStripeMeters.length} meters`,
		);
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
};

export const deleteAllStripeProducts = async ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => {
	const stripeCli = createStripeCli({ org, env });

	const stripeProducts = await stripeCli.products.list({
		limit: 100,
		active: true,
	});

	if (stripeProducts.data.length === 0) {
		return;
	}

	const firstProduct = stripeProducts.data[0];
	if (firstProduct.livemode) {
		throw new RecaseError({
			message: "Cannot delete livemode products",
			code: ErrCode.DeleteStripeProductFailed,
			statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
		});
	}

	const batchSize = 50;
	for (let i = 0; i < stripeProducts.data.length; i += batchSize) {
		const batch = stripeProducts.data.slice(i, i + batchSize);
		await Promise.all(
			batch.map(async (p) => {
				try {
					await stripeCli.products.del(p.id);
				} catch (_error) {
					await stripeCli.products.update(p.id, {
						active: false,
					});
				}
			}),
		);
		console.log(
			`Deleted ${i + batch.length}/${stripeProducts.data.length} products`,
		);
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
};
