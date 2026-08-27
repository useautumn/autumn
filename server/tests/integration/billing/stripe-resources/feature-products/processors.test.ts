/**
 * catalogV2.update processors.stripe — stamp, GET echo, omit keeps, attach uses it.
 *
 * Standalone features.update / features.create do not accept processors.
 */

import { expect, test } from "bun:test";
import {
	type ApiFeatureV1,
	type AttachParamsV1Input,
	FeatureType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	getFeatureRow,
	uniqueSuffix,
	usagePriceForFeature,
} from "./utils/createUnmintedFeaturePlans.js";

const messagesCatalogEntry = ({
	name,
	processors,
}: {
	name: string;
	processors?: ApiFeatureV1["processors"];
}) => ({
	feature_id: TestFeature.Messages,
	name,
	type: FeatureType.Metered,
	consumable: true,
	...(processors ? { processors } : {}),
});

const catalogFeature = ({
	features,
}: {
	features: ApiFeatureV1[];
}): ApiFeatureV1 => {
	const feature = features.find(
		(candidate) => candidate.id === TestFeature.Messages,
	);
	expect(feature).toBeDefined();
	return feature!;
};

test.concurrent(
	`${chalk.yellowBright("feature-products: catalog processors.stripe stamps, GET echoes, omit keeps, attach uses it")}`,
	async () => {
		const suffix = uniqueSuffix();
		const customerId = `fp-proc-${suffix}`;
		const keptName = `Messages ${suffix}`;
		const pro = products.pro({
			id: `fp-proc-pro-${suffix}`,
			items: [items.consumableMessages()],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro], createInStripe: false }),
			],
			actions: [],
		});

		const current = await getFeatureRow({ ctx });
		const stripeProduct = await ctx.stripeCli.products.create({
			name: `User product ${suffix}`,
		});
		const stripeMeter = await ctx.stripeCli.billing.meters.create({
			display_name: `User meter ${suffix}`,
			event_name: `fp_proc_event_${suffix}`,
			default_aggregation: { formula: "sum" },
		});

		const updated = await autumnV2_3.catalogV2.update({
			features: [
				messagesCatalogEntry({
					name: current.name,
					processors: {
						stripe: {
							product_id: stripeProduct.id,
							meter_id: stripeMeter.id,
						},
					},
				}),
			],
		});
		const stamped = catalogFeature({ features: updated.features });
		expect(stamped.processors?.stripe?.product_id).toBe(stripeProduct.id);
		expect(stamped.processors?.stripe?.meter_id).toBe(stripeMeter.id);

		const catalog = await autumnV2_3.catalogV2.get();
		const got = catalogFeature({ features: catalog.features });
		expect(got.processors?.stripe?.product_id).toBe(stripeProduct.id);
		expect(got.processors?.stripe?.meter_id).toBe(stripeMeter.id);

		const omitted = await autumnV2_3.catalogV2.update({
			features: [messagesCatalogEntry({ name: keptName })],
		});
		const kept = catalogFeature({ features: omitted.features });
		expect(kept.name).toBe(keptName);
		expect(kept.processors?.stripe?.product_id).toBe(stripeProduct.id);
		expect(kept.processors?.stripe?.meter_id).toBe(stripeMeter.id);

		const renamedProduct = await ctx.stripeCli.products.retrieve(
			stripeProduct.id,
		);
		expect(renamedProduct.name).toBe(keptName);

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});

		const feature = await getFeatureRow({ ctx });
		expect(feature.stripe_product_id).toBe(stripeProduct.id);
		expect(feature.stripe_meter?.id).toBe(stripeMeter.id);

		const usage = await usagePriceForFeature({ ctx, productId: pro.id });
		expect(usage.config.stripe_product_id).toBe(stripeProduct.id);
		expect(usage.config.stripe_meter_id).toBe(stripeMeter.id);
	},
);
