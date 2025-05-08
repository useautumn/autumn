import { compareMainProduct } from "../../utils/compare.js";

import { entityProducts, features } from "../../global.js";

import { assert, expect } from "chai";
import chalk from "chalk";
import AutumnError, { Autumn } from "@/external/autumn/autumnCli.js";
import { setupBefore } from "tests/before.js";
import { CusProductStatus, ErrCode } from "@autumn/shared";
import {
  getFeaturePrice,
  getUsagePriceTiers,
  timeout,
} from "tests/utils/genUtils.js";

import { Stripe } from "stripe";
import { CusService } from "@/internal/customers/CusService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { checkBalance } from "tests/utils/autumnUtils.js";
import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addHours, addMonths } from "date-fns";
import { CacheManager } from "@/external/caching/CacheManager.js";
import { CacheType } from "@/external/caching/cacheActions.js";
import { hashApiKey } from "@/internal/dev/api-keys/apiKeyUtils.js";

// Check balance and stripe quantity
const checkEntAndStripeQuantity = async ({
  sb,
  autumn,
  stripeCli,
  featureId,
  customerId,
  expectedBalance,
  expectedUsage,
  expectedStripeQuantity,
}: {
  sb: SupabaseClient;
  autumn: Autumn;
  stripeCli: Stripe;
  featureId: string;
  customerId: string;
  expectedBalance: number;
  expectedUsage?: number;
  expectedStripeQuantity: number;
}) => {
  let { customer, entitlements, products } = await autumn.customers.get(
    customerId
  );

  let cusProducts = await CusService.getFullCusProducts({
    sb,
    internalCustomerId: customer.internal_id,
    withPrices: true,
    withProduct: true,
    inStatuses: [CusProductStatus.Active],
  });

  let entitlement = entitlements.find((e: any) => e.feature_id == featureId);

  expect(entitlement.balance).to.equal(expectedBalance);
  if (expectedUsage) {
    expect(entitlement.used).to.equal(
      expectedUsage,
      `Get customer ${customerId} returned incorrect "used" for feature ${featureId}`
    );
  }

  if (products.length == 0) {
    assert.fail(`Get customer ${customerId} returned no products`);
  }

  // 2. Get stripe quantity
  let mainProduct = products[0];

  if (mainProduct.subscription_ids.length == 0) {
    assert.fail(`Get customer ${customerId} returned no subscriptions`);
  }

  let price = getFeaturePrice({
    product: mainProduct,
    featureId: featureId,
    cusProducts,
  });

  if (!price) {
    assert.fail(
      `Get customer ${customerId} returned no price for feature ${featureId}`
    );
  }

  let stripeSub = await stripeCli.subscriptions.retrieve(
    mainProduct.subscription_ids[0]
  );
  let subItem = stripeSub.items.data.find(
    (item: any) => item.price.id == price.config!.stripe_price_id
  );

  if (!subItem) {
    assert.fail(
      `Get customer ${customerId} returned no sub item for feature ${featureId}`
    );
  }

  expect(subItem.quantity).to.equal(
    expectedStripeQuantity,
    `Get customer ${customerId} returned incorrect stripe quantity for feature ${featureId}`
  );
};

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright("entities1: Testing entities")}`, () => {
  let customerId = "entity1";
  let autumn: Autumn;
  let stripeCli: Stripe;
  let usageTiers = getUsagePriceTiers({
    product: entityProducts.entityPro,
    featureId: features.seats.id,
  });
  let testClockId: string;

  before(async function () {
    await setupBefore(this);
    autumn = this.autumn;
    stripeCli = this.stripeCli;

    const { testClockId: testClockId1 } = await initCustomerWithTestClock({
      customerId,
      sb: this.sb,
      org: this.org,
      env: this.env,
    });

    testClockId = testClockId1;

    // Update org config
    await this.sb
      .from("organizations")
      .update({
        config: {
          ...this.org.config,
          prorate_unused: false,
        },
      })
      .eq("id", this.org.id);

    await CacheManager.invalidate({
      action: CacheType.SecretKey,
      value: hashApiKey(process.env.UNIT_TEST_AUTUMN_SECRET_KEY!),
    });
    await CacheManager.disconnect();
  });

  describe("Create customer -- create entity should fail", async function () {
    let firstEntityId = "1";

    // it("should fail to add seat when there's no balance", async function () {
    //   try {
    //     await this.autumn.entities.create(customerId, {
    //       id: "test",
    //       name: "test",
    //       featureId: "seats",
    //     });

    //     assert.fail("create entity should have failed");
    //   } catch (error: any) {
    //     expect(error).to.be.instanceOf(AutumnError);
    //     expect(error.code).to.equal(ErrCode.InsufficientBalance);
    //   }
    // });

    it("should attach entityFree product", async function () {
      await this.autumn.attach({
        customerId,
        productId: entityProducts.entityFree.id,
      });

      await this.autumn.entities.create(customerId, {
        id: firstEntityId,
        name: "1@gmail.com",
        featureId: features.seats.id,
      });

      // Check if entity is created
      let res = await this.autumn.entities.list(customerId);
      let entities = res.data;

      expect(entities).to.have.lengthOf(1);
      expect(entities[0].id).to.equal(firstEntityId);
    });

    it("should successfully remove created entity", async function () {
      await this.autumn.entities.delete(customerId, firstEntityId);

      let res = await this.autumn.entities.list(customerId);
      let entities = res.data;
      expect(entities).to.have.lengthOf(0);
    });

    it("should create first entity, then attach entityPro product", async function () {
      await this.autumn.entities.create(customerId, {
        id: firstEntityId,
        name: "1@gmail.com",
        featureId: features.seats.id,
      });

      await this.autumn.attach({
        customerId,
        productId: entityProducts.entityPro.id,
      });

      // Check product is attached correctly
      let cusRes = await autumn.customers.get(customerId);
      compareMainProduct({
        sent: entityProducts.entityPro,
        cusRes: cusRes,
      });

      let { invoices } = cusRes;
      let usageTiers = getUsagePriceTiers({
        product: entityProducts.entityPro,
        featureId: features.seats.id,
      });

      // Check invoice is created correctly
      expect(invoices).to.have.lengthOf(1);
      expect(invoices[0].total).to.equal(usageTiers[0].amount);

      // Check balance and stripe quantity
      await checkEntAndStripeQuantity({
        sb: this.sb,
        autumn,
        stripeCli,
        featureId: features.seats.id,
        customerId,
        expectedBalance: -1,
        expectedStripeQuantity: 1,
      });

      await checkBalance({
        autumn,
        featureId: features.metered1.id,
        customerId,
        expectedBalance:
          entityProducts.entityPro.entitlements.metered1.allowance!,
      });
    });

    let newEntities = [
      {
        id: "2",
        name: "2@gmail.com",
        featureId: features.seats.id,
      },
      {
        id: "3",
        name: "3@gmail.com",
        featureId: features.seats.id,
      },
      {
        id: "4",
        name: "4@gmail.com",
        featureId: features.seats.id,
      },
    ];

    it("should create 3 additional entities and be charged immediately", async function () {
      await this.autumn.entities.create(customerId, newEntities);

      let entitiesRes = await this.autumn.entities.list(customerId);
      let entities = entitiesRes.data;
      expect(entities).to.have.lengthOf(newEntities.length + 1);

      let cusRes = await autumn.customers.get(customerId);

      let { invoices } = cusRes;
      expect(invoices[0].total).to.equal(
        usageTiers[0].amount * newEntities.length
      );
    });

    it("should remove 2 entities, and have correct balance / stripe quantity", async function () {
      await this.autumn.entities.delete(customerId, newEntities[0].id);

      await checkEntAndStripeQuantity({
        sb: this.sb,
        autumn,
        stripeCli,
        featureId: features.seats.id,
        customerId,
        expectedBalance: -(newEntities.length + 1),
        expectedStripeQuantity: newEntities.length + 1 - 1,
        expectedUsage: newEntities.length + 1 - 1,
      });

      await this.autumn.entities.delete(customerId, newEntities[1].id);
      await checkEntAndStripeQuantity({
        sb: this.sb,
        autumn,
        stripeCli,
        featureId: features.seats.id,
        customerId,
        expectedBalance: -(newEntities.length + 1),
        expectedStripeQuantity: newEntities.length + 1 - 2,
        expectedUsage: newEntities.length + 1 - 2,
      });
    });

    let newEntities2 = [
      {
        id: "5",
        name: "5@gmail.com",
        featureId: features.seats.id,
      },
      {
        id: "6",
        name: "6@gmail.com",
        featureId: features.seats.id,
      },
      {
        id: "7",
        name: "7@gmail.com",
        featureId: features.seats.id,
      },
    ];

    it("should create three additional seats, and be charged for only one", async function () {
      await this.autumn.entities.create(customerId, newEntities2);

      let totalSeats = newEntities2.length + 2;
      await checkEntAndStripeQuantity({
        sb: this.sb,
        autumn,
        stripeCli,
        featureId: features.seats.id,
        customerId,
        expectedBalance: -totalSeats,
        expectedStripeQuantity: totalSeats,
        expectedUsage: totalSeats,
      });

      let cusRes = await autumn.customers.get(customerId);
      let { invoices } = cusRes;
      expect(invoices[0].total).to.equal(usageTiers[0].amount);
    });

    // return;

    it("should remove one entity, and have correct balance / stripe quantity after advancing test clock", async function () {
      await this.autumn.entities.delete(customerId, newEntities2[0].id);

      let totalSeats = newEntities2.length + 1;

      let advanceTo = addHours(addMonths(new Date(), 1), 4).getTime();
      await advanceTestClock({ stripeCli, testClockId, advanceTo });

      // Get entities
      let { data: entities } = await this.autumn.entities.list(customerId);
      expect(entities).to.have.lengthOf(totalSeats);

      await checkEntAndStripeQuantity({
        sb: this.sb,
        autumn,
        stripeCli,
        featureId: features.seats.id,
        customerId,
        expectedBalance: -totalSeats,
        expectedStripeQuantity: totalSeats,
        expectedUsage: totalSeats,
      });

      await checkBalance({
        autumn,
        featureId: features.metered1.id,
        customerId,
        expectedBalance:
          totalSeats *
          entityProducts.entityPro.entitlements.metered1.allowance!,
      });
    });
  });

  after(async function () {
    await this.sb
      .from("organizations")
      .update({
        config: {
          ...this.org.config,
          prorate_unused: true,
        },
      })
      .eq("id", this.org.id);
    void CacheManager.invalidate({
      action: CacheType.SecretKey,
      value: hashApiKey(process.env.UNIT_TEST_AUTUMN_SECRET_KEY!),
    });
  });
});
