import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { getExistingCusProducts } from "../../cusProducts/cusProductUtils/getExistingCusProducts.js";
import { CusProductStatus } from "@autumn/shared";

export const attachParamsToCurCusProduct = ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { curMainProduct, curSameProduct, curScheduledProduct } =
    attachParamToCusProducts({ attachParams });

  return curSameProduct || curMainProduct;
};

export const attachParamToCusProducts = ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { curMainProduct, curSameProduct, curScheduledProduct } =
    getExistingCusProducts({
      product: attachParams.products[0],
      cusProducts: attachParams.cusProducts!,
      internalEntityId: attachParams.internalEntityId,
    });

  const curCusProduct = curMainProduct || curSameProduct;

  return { curMainProduct, curSameProduct, curScheduledProduct, curCusProduct };
};

export const attachParamsToProduct = ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { org, features, prices, entitlements, freeTrial } = attachParams;
  const product = attachParams.products[0];

  return {
    ...product,
    prices,
    entitlements,
    free_trial: freeTrial,
  };
};

export const paramsToCurSub = async ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { stripeCli } = attachParams;
  const curCusProduct = attachParamsToCurCusProduct({ attachParams });

  const subIds = curCusProduct?.subscription_ids || [];
  if (subIds.length === 0) {
    return undefined;
  }

  const sub = await stripeCli.subscriptions.retrieve(subIds[0], {
    expand: ["items.data.price.tiers"],
  });

  return sub;
};

export const paramsToCurSubSchedule = async ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { stripeCli } = attachParams;
  const curCusProduct = attachParamsToCurCusProduct({ attachParams });

  const subScheduleIds = curCusProduct?.scheduled_ids || [];
  if (subScheduleIds.length === 0) {
    return {
      schedule: null,
      prices: [],
    };
  }

  const schedule = await stripeCli.subscriptionSchedules.retrieve(
    subScheduleIds[0]
  );

  if (schedule.status == "canceled") {
    return {
      schedule: null,
      prices: [],
    };
  }

  const batchPricesGet = [];
  for (const item of schedule.phases[0].items) {
    batchPricesGet.push(stripeCli.prices.retrieve(item.price as string));
  }
  const prices = await Promise.all(batchPricesGet);

  return {
    schedule,
    prices,
  };
};
