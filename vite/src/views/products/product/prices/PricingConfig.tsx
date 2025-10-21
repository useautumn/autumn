import { BillingInterval, BillWhen, PriceType } from "@autumn/shared";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { invalidNumber } from "@/utils/genUtils";

export const PricingConfig = ({
	priceConfig,
	setPriceConfig,
	isUpdate = false,
}: {
	priceConfig?: any;
	setPriceConfig: any;
	isUpdate?: boolean;
}) => {
	const defaultFixedConfig = {
		type: PriceType.Fixed,
		amount: "",
		interval: BillingInterval.Month,
	};

	const defaultUsageConfig = {
		type: PriceType.Usage,
		internal_feature_id: "",
		feature_id: "",
		bill_when: BillWhen.EndOfPeriod,
		interval: BillingInterval.Month,
		billing_units: "",
		usage_tiers: [
			{
				from: 0,
				to: -1,
				amount: 0.0,
			},
		],
		should_prorate: false,
	};

	const [priceType, setPriceType] = useState(
		priceConfig?.type || PriceType.Fixed,
	);

	const [name, setName] = useState(priceConfig?.name || "");
	const [usageTiers, setUsageTiers] = useState<any[]>([]);
	const [fixedConfig, setFixedConfig] = useState(
		priceConfig && priceConfig.type == PriceType.Fixed
			? priceConfig
			: defaultFixedConfig,
	);
	const [usageConfig, setUsageConfig]: any = useState(
		priceConfig?.config && priceConfig.config.type == PriceType.Usage
			? priceConfig.config
			: defaultUsageConfig,
	);

	const [originalPrice, _] = useState(priceConfig);

	useEffect(() => {
		setPriceConfig(
			fixedConfig,
			//   {
			//   ...originalPrice,
			//   name: name,
			//   config: priceType === PriceType.Fixed ? fixedConfig : usageConfig,

			// }
		);
	}, [
		fixedConfig,
		usageConfig,
		priceType,
		name,
		setPriceConfig,
		originalPrice,
	]);

	return (
		<div className="overflow-hidden flex flex-col gap-4 w-full">
			{/* <div className="flex flex-col">
        <FieldLabel>Name</FieldLabel>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Price Name"
        />
      </div> */}
			<Tabs
				value={priceType}
				onValueChange={(value) => setPriceType(value as PriceType)}
				defaultValue={priceType}
			>
				{/* <TabsList>
          <TabsTrigger value={PriceType.Fixed}>Flat Fee</TabsTrigger>
          <TabsTrigger value={PriceType.Usage}>Usage Based</TabsTrigger>
        </TabsList> 
        <TabsContent value={PriceType.Fixed}> */}
				{/* <CreateFixedPrice config={fixedConfig} setConfig={setFixedConfig} /> */}
				{/*  </TabsContent>
        <TabsContent value={PriceType.Usage}>
          <CreateUsagePrice
            config={usageConfig}
            setConfig={setUsageConfig}
            usageTiers={usageTiers}
            setUsageTiers={setUsageTiers}
            price={price}
            isUpdate={isUpdate}
          />
        </TabsContent> */}
			</Tabs>
		</div>
	);
};

// Validate usage price config
export const validateUsageConfig = (usageConfig: any) => {
	const config = { ...usageConfig };
	const { bill_when, interval, billing_units } = config;

	if (!config.internal_feature_id) {
		toast.error("Please select an entitlement");
		return null;
	}

	if (config.usage_tiers.slice(0, -1).some((tier: any) => tier.to < 0)) {
		toast.error("There can be no negative values in your pricing tiers");
		return null;
	}

	if (bill_when === BillWhen.StartOfPeriod) {
		if (!interval) {
			toast.error("Please fill out all fields");
			return null;
		}

		config.interval = interval;
	}

	if (
		bill_when === BillWhen.EndOfPeriod ||
		bill_when === BillWhen.StartOfPeriod
	) {
		if (!billing_units || invalidNumber(billing_units)) {
			toast.error("Please fill out all fields");
			return null;
		}

		config.billing_units = parseFloat(billing_units);
	} else {
		config.billing_units = null;
	}

	// Check individual tier validity
	for (let i = 0; i < config.usage_tiers.length; i++) {
		const tier = config.usage_tiers[i];
		if (invalidNumber(tier.from) || invalidNumber(tier.amount)) {
			toast.error("Please fill out all tier fields");
			return null;
		}

		// Check current tier's range is valid
		if (
			parseFloat(tier.to) !== -1 &&
			parseFloat(tier.to) < parseFloat(tier.from)
		) {
			toast.error(
				"Each tier's 'to' value must be greater than its 'from' value",
			);
			return null;
		}

		config.usage_tiers[i].from = parseFloat(config.usage_tiers[i].from);
		config.usage_tiers[i].to = parseFloat(config.usage_tiers[i].to);
		config.usage_tiers[i].amount = parseFloat(config.usage_tiers[i].amount);
	}

	config.should_prorate = config.should_prorate || false;
	return config;
};

// Validate fixed price config
export const validateFixedConfig = (fixedConfig: any) => {
	const config = { ...fixedConfig };

	if (invalidNumber(config.amount) || !config.interval) {
		toast.error("Please fill out all fields");
		return null;
	}
	config.amount = parseFloat(config.amount.toString());
	return config;
};

export const validateConfig = (price: any, prices: any) => {
	const priceType = price.config.type;
	let config = null;

	if (!price.name) {
		toast.error("Please fill out a name");
		return null;
	}

	if (priceType === PriceType.Fixed) {
		config = validateFixedConfig(price.config);
	} else if (priceType === PriceType.Usage) {
		config = validateUsageConfig(price.config);
	}
	return config;
};
