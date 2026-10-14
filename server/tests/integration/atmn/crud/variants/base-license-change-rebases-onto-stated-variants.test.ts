import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { productForSlug } from "@tests/utils/atmnUtils/productForSlug.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const messagesItem = (included: number) =>
	`{ featureId: "messages", included: ${included}, reset: { interval: "month" } }`;

const euVariant = ({ slug, messages }: { slug: string; messages: number }) =>
	`{ variantPlanId: "teamEu", name: "Team EU", versionSlug: "${slug}", customize: { removeItems: [{ featureId: "messages", interval: "month", intervalCount: 1 }], addItems: [${messagesItem(messages)}] } }`;

const config = ({
	seatLink,
	euSlugs,
}: {
	seatLink: string;
	euSlugs: string[];
}) => `{
	features: [
		feature({ featureId: "messages", name: "Messages", type: "metered", consumable: true }),
	],
	plans: [
		plan({ active: true, planId: "seat", versionSlug: "v2", name: "Seat", addOn: true, items: [${messagesItem(20)}] }),
		plan({
			active: true,
			planId: "team",
			versionSlug: "v1",
			name: "Team",
			items: [${messagesItem(100)}],
			licenses: [${seatLink}],
			variants: [${euSlugs.map((slug, i) => euVariant({ slug, messages: 200 * (i + 1) })).join(", ")}],
		}),
	
		plan({ active: false, planId: "seat", versionSlug: "v1", name: "Seat", addOn: true, items: [${messagesItem(10)}] }),
	],
}`;

const seatLinkOf = async ({
	ctx,
	planId,
	versionSlug,
}: {
	ctx: AutumnContext;
	planId: string;
	versionSlug: string;
}) => {
	const product = await productForSlug({ ctx, planId, versionSlug });
	const link = (product.licenses ?? []).find((l) => l.product.id === "seat");
	return {
		seatSlug: link?.product.version_slug,
		customized: link?.customized ?? false,
		messages: link?.product.entitlements.find(
			(e) => e.feature.id === "messages",
		)?.allowance,
	};
};

const linkedRows = [
	["team", "v1"],
	["teamEu", "v1"],
	["teamEu", "v2"],
] as const;

test.concurrent(
	`${chalk.yellowBright("base relinks seat v1 → v2: both stated Team EU rows follow; customizing the base link follows too")}`,
	async () => {
		const v1Link = `{ licensePlanId: "seat", versionSlug: "v1", included: 2 }`;
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					setupDefaultFeatures: true,
				}),
			],
			config: config({ seatLink: v1Link, euSlugs: ["v1"] }),
		});

		try {
			await scenario.push();
			scenario.writeConfig(
				atmnConfigSource({
					body: config({ seatLink: v1Link, euSlugs: ["v1", "v2"] }),
				}),
			);
			await scenario.push();
			for (const [planId, versionSlug] of linkedRows) {
				expect(
					await seatLinkOf({ ctx: scenario.ctx, planId, versionSlug }),
				).toMatchObject({ seatSlug: "v1", customized: false, messages: 10 });
			}

			scenario.writeConfig(
				atmnConfigSource({
					body: config({
						seatLink: `{ licensePlanId: "seat", versionSlug: "v2", included: 2 }`,
						euSlugs: ["v1", "v2"],
					}),
				}),
			);
			await expectRoundTrip({ scenario });
			for (const [planId, versionSlug] of linkedRows) {
				expect(
					await seatLinkOf({ ctx: scenario.ctx, planId, versionSlug }),
				).toMatchObject({ seatSlug: "v2", customized: false, messages: 20 });
			}

			scenario.writeConfig(
				atmnConfigSource({
					body: config({
						seatLink: `{ licensePlanId: "seat", versionSlug: "v2", included: 2, customize: { removeItems: [{ featureId: "messages", interval: "month", intervalCount: 1 }], addItems: [${messagesItem(30)}] } }`,
						euSlugs: ["v1", "v2"],
					}),
				}),
			);
			await expectRoundTrip({ scenario });
			for (const [planId, versionSlug] of linkedRows) {
				expect(
					await seatLinkOf({ ctx: scenario.ctx, planId, versionSlug }),
				).toMatchObject({ seatSlug: "v2", customized: true, messages: 30 });
			}
		} finally {
			scenario.cleanup();
		}
	},
);
