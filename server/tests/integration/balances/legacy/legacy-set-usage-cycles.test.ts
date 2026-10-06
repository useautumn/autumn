import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	OnDecrease,
	OnIncrease,
	ProductItemFeatureType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { getSubsFromCusId } from "@tests/utils/expectUtils/expectSubUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import chalk from "chalk";
import { addDays, addHours } from "date-fns";
import { Decimal } from "decimal.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

// =============================================================================
// MIGRATED FROM: set-usage1.test.ts
// Tests /usage endpoint with arrear prorated seats (ProrateNextCycle)
// Simulates full billing cycles with random clock advances and verifies invoices
// =============================================================================

test.concurrent(
	`${chalk.yellowBright("legacy-set-usage1: proration cycle simulation with /usage")}`,
	async () => {
		const seatsItem = constructArrearProratedItem({
			featureId: TestFeature.Users,
			featureType: ProductItemFeatureType.ContinuousUse,
			pricePerUnit: 20,
			includedUsage: 3,
			config: {
				on_increase: OnIncrease.ProrateNextCycle,
				on_decrease: OnDecrease.ProrateNextCycle,
			},
		});

		const seatsProduct = constructProduct({
			type: "pro",
			items: [seatsItem],
		});

		const includedUsage = seatsItem.included_usage as number;

		const { customerId, autumnV1, ctx, testClockId } = await initScenario({
			customerId: "legacy-set-usage1",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [seatsProduct] }),
			],
			actions: [s.attach({ productId: seatsProduct.id })],
		});

		// --- Helper: simulate one billing cycle ---
		const simulateOneCycle = async ({
			curUnix,
			usageValues,
		}: {
			curUnix: number;
			usageValues: number[];
		}) => {
			const { subs } = await getSubsFromCusId({
				customerId,
				db: ctx.db,
				org: ctx.org,
				env: ctx.env,
				stripeCli: ctx.stripeCli,
				productId: seatsProduct.id,
			});

			const sub = subs[0];

			let accruedPrice = 0;
			for (const usageValue of usageValues) {
				const daysToAdvance = Math.round(Math.random() * 10) + 1;
				curUnix = await advanceTestClock({
					stripeCli: ctx.stripeCli,
					testClockId: testClockId!,
					advanceTo: addDays(curUnix, daysToAdvance).getTime(),
				});

				const customer =
					await autumnV1.customers.get<ApiCustomerV3>(customerId);
				const prevBalance = customer.features[TestFeature.Users].balance!;

				await autumnV1.usage({
					customer_id: customerId,
					feature_id: TestFeature.Users,
					value: usageValue,
				});

				const newBalance = includedUsage - usageValue;
				const prevOverage = Math.max(0, -prevBalance);
				const newOverage = Math.max(0, -newBalance);

				const newPrice = (newOverage - prevOverage) * seatsItem.price!;

				const { start, end } = subToPeriodStartEnd({ sub });
				const proratedPrice = calculateProrationAmount({
					periodStart: start * 1000,
					periodEnd: end * 1000,
					now: curUnix,
					amount: newPrice,
					allowNegative: true,
				});

				accruedPrice = new Decimal(accruedPrice).plus(proratedPrice).toNumber();
			}

			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			const balance = customer.features[TestFeature.Users].balance!;

			const overage = Math.min(0, includedUsage - balance);
			const usagePrice = overage * seatsItem.price!;
			const basePrice = getBasePrice({ product: seatsProduct });

			const totalPrice = new Decimal(accruedPrice)
				.plus(usagePrice)
				.plus(basePrice)
				.toDecimalPlaces(2)
				.toNumber();

			const { end } = subToPeriodStartEnd({ sub });
			curUnix = await advanceTestClock({
				stripeCli: ctx.stripeCli,
				testClockId: testClockId!,
				advanceTo: addHours(end * 1000, hoursToFinalizeInvoice).getTime(),
			});

			const cusAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			const invoices = cusAfter.invoices!;
			const invoice = invoices[0];

			expect(invoice.total).toBeLessThanOrEqual(
				new Decimal(totalPrice).plus(0.01).toNumber(),
			);
			expect(invoice.total).toBeGreaterThanOrEqual(
				new Decimal(totalPrice).minus(0.01).toNumber(),
			);

			return { curUnix };
		};

		// Cycle 1: usage fluctuates [8, 2]
		const { curUnix } = await simulateOneCycle({
			curUnix: Date.now(),
			usageValues: [8, 2],
		});

		// Cycle 2: usage fluctuates [12, 3]
		await simulateOneCycle({
			curUnix,
			usageValues: [12, 3],
		});
	},
); // Longer timeout for Stripe test clock operations
