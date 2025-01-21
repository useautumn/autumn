import { BillingInterval, BillWhen, PriceType } from "@autumn/shared";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import CreateFixedPrice from "./CreateFixedPrice";
import CreateUsagePrice from "./CreateUsagePrice";
import toast from "react-hot-toast";
import { invalidNumber } from "@/utils/genUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import { validBillingInterval } from "@/utils/product/priceUtils";

export const PricingConfig = ({
  price,
  setPrice,
}: {
  price?: any;
  setPrice: any;
}) => {
  const { env, prices } = useProductContext();

  const defaultFixedConfig = {
    type: PriceType.Fixed,
    amount: "",
    interval: BillingInterval.Month,
  };

  const defaultUsageConfig = {
    type: PriceType.Usage,
    entitlement_id: "",
    bill_when: BillWhen.InAdvance,
    interval: BillingInterval.Month,
    usage_tiers: [
      {
        from: 0,
        to: -1,
        amount: 0.0,
      },
    ],
  };

  const [priceType, setPriceType] = useState(price?.config?.type || PriceType.Fixed);
  const [name, setName] = useState(price?.name || "");
  const [usageTiers, setUsageTiers] = useState<any[]>([]);
  const [fixedConfig, setFixedConfig] = useState(price?.config.amount ? price.config : defaultFixedConfig);
  const [usageConfig, setUsageConfig]: any = useState(price?.config.entitlement_id ? price.config : defaultUsageConfig);

  useEffect(() => {
    if (priceType === PriceType.Fixed) {
      setPrice({
        name: name,
        config: {
          ...fixedConfig,
          type: PriceType.Fixed,
        },
        id: price?.id,
      });
    } else if (priceType === PriceType.Usage) {
      setPrice({
        name: name,
        config: {
          ...usageConfig,
          type: PriceType.Usage,
        },
        id: price?.id,
      });
    }
  }, [fixedConfig, usageConfig, priceType, setPrice, name]);

  return (
    <>
      <div className="flex flex-col">
        <FieldLabel>Name</FieldLabel>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Price Name"
        />
      </div>
      <Tabs
        value={priceType}
        onValueChange={(value) => setPriceType(value as PriceType)}
        defaultValue={priceType}
      >
        <TabsList>
          <TabsTrigger value={PriceType.Fixed}>Flat Fee</TabsTrigger>
          <TabsTrigger value={PriceType.Usage}>Usage Based</TabsTrigger>
        </TabsList>
        <TabsContent value={PriceType.Fixed}>
          <CreateFixedPrice config={fixedConfig} setConfig={setFixedConfig} />
        </TabsContent>
        <TabsContent value={PriceType.Usage}>
          <CreateUsagePrice
            config={usageConfig}
            setConfig={setUsageConfig}
            usageTiers={usageTiers}
            setUsageTiers={setUsageTiers}
          />
        </TabsContent>
      </Tabs>
    </>
  );
};

export const validateUsageConfig = (usageConfig: any) => {
  const config = { ...usageConfig };
  const { entitlement_id, billing_units, bill_when, threshold, interval } =
    config;

  if (bill_when === BillWhen.BelowThreshold) {
    // if (invalidNumber(threshold)) {
    //   toast.error("Please fill out all fields");
    //   return null;
    // }
    // config.threshold = parseFloat(threshold);
  } else if (bill_when === BillWhen.InAdvance) {
    if (!interval) {
      toast.error("Please fill out all fields");
      return null;
    }

    config.interval = interval;
  }

  for (let i = 0; i < config.usage_tiers.length; i++) {
    const tier = config.usage_tiers[i];
    if (
      invalidNumber(tier.from) ||
      invalidNumber(tier.to) ||
      invalidNumber(tier.amount)
    ) {
      toast.error("Please fill out all tier fields");
      return null;
    }

    config.usage_tiers[i].from = parseFloat(config.usage_tiers[i].from);
    config.usage_tiers[i].to = parseFloat(config.usage_tiers[i].to);
    config.usage_tiers[i].amount = parseFloat(config.usage_tiers[i].amount);
  }

  return config;
};

export const validateFixedConfig = (fixedConfig: any, prices: any) => {
  if (!validBillingInterval(prices, fixedConfig)) {
    toast.error("Can't have two prices with different billing intervals");
    return null;
  }

  const config = { ...fixedConfig };

  if (invalidNumber(config.amount) || !config.interval) {
    toast.error("Please fill out all fields");
    return null;
  }
  config.amount = parseFloat(config.amount.toString());
  return config;
};
