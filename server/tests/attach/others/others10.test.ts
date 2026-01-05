import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { generateId } from "@/utils/genUtils";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const pro = constructProduct({
    type: "pro",
    items: [
        constructFeatureItem({
            featureId: TestFeature.Credits,
            includedUsage: 500,
        }),
    ],
});

const testCase = "others10";

describe(`${chalk.yellowBright("idempotency: idempotency key already exists")}`, () => {
    const customerId = testCase;
    const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
    const idempotencyKey = generateId("it");

    let results: PromiseSettledResult<
        Awaited<ReturnType<typeof autumnV1.attach>>
    >[];

    beforeAll(async () => {
        await initCustomerV3({
            ctx,
            customerId,
            withTestClock: true,
            attachPm: "success",
        });

        await initProductsV0({
            ctx,
            products: [pro],
            prefix: testCase,
        });

        results = await Promise.allSettled([
            autumnV1.attach(
                {
                    customer_id: customerId,
                    product_id: pro.id,
                },
                {
                    "idempotency-key": idempotencyKey,
                },
            ),
            autumnV1.attach(
                {
                    customer_id: customerId,
                    product_id: pro.id,
                },
                {
                    "idempotency-key": idempotencyKey,
                },
            ),
        ]);
    });

    test("should reject duplicate idempotency key with 409", async () => {
        // Exactly one request should succeed
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter((r) => r.status === "rejected");

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        // The successful request should have attached the product
        const successResult = fulfilled[0] as PromiseFulfilledResult<
            Awaited<ReturnType<typeof autumnV1.attach>>
        >;
        expect(successResult.value.success).toBe(true);
        expect(successResult.value.customer_id).toBe(customerId);
        expect(successResult.value.product_ids).toContain(pro.id);

        // The rejected request should have the duplicate idempotency key error
        const rejectedResult = rejected[0] as PromiseRejectedResult;
        expect(rejectedResult.reason).toBeInstanceOf(AutumnError);
        expect((rejectedResult.reason as AutumnError).code).toBe(
            ErrCode.DuplicateIdempotencyKey,
        );
    });
});
