import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
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

const testCase = "legacy-balance-update1";

describe(`${chalk.yellowBright("legacy-balance-update1: allow updating balances for an entity")}`, () => {
    const customerId = testCase;
    const entityId = `${testCase}-user-1`;
    const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

    beforeAll(async () => {
        await initCustomerV3({
            ctx,
            customerId,
            withTestClock: true,
            attachPm: "success",
        });

        await autumnV1.entities.create(customerId, [
            {
                id: entityId,
                name: "User 1",
                feature_id: TestFeature.Credits,
            },
        ]);

        await initProductsV0({
            ctx,
            products: [pro],
            prefix: testCase,
        });

        await autumnV1.attach({
            customer_id: customerId,
            entity_id: entityId,
            product_id: pro.id,
        });
    });

    test("should allow updating balances for an entity", async () => {
        await autumnV1.customers.setBalance({
            customerId: customerId,
            entityId: entityId,
            balances: [
                {
                    feature_id: TestFeature.Credits,
                    balance: 100,
                },
            ],
        });

        const entity = await autumnV1.entities.get(customerId, entityId);

        expect(entity.features.credits.balance).toBe(100);
    });
});
