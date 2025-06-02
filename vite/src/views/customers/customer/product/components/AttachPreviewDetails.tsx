import {
  PriceItem,
  QuantityInput,
} from "@/components/pricing/attach-pricing-dialog";

export const AttachPreviewDetails = ({
  options,
  setOptions,
  preview,
}: {
  options: any;
  setOptions: any;
  preview: any;
}) => {
  const getTotalPrice = () => {
    let total = preview?.due_today?.price || 0;
    options.forEach((option: any) => {
      if (option.price && option.quantity) {
        total += option.price * (option.quantity / option.billing_units);
      }
    });
    return total;
  };

  return (
    <div className="flex flex-col gap-1">
      <p className="text-t2 font-semibold mb-2">Amount</p>
      {preview &&
        preview.items &&
        preview.items.length > 0 &&
        preview.items.map((item: any) => {
          const { description, price } = item;
          return (
            <PriceItem key={description}>
              <span>{description}</span>
              <span>{price}</span>
            </PriceItem>
          );
        })}

      {options.length > 0 &&
        options.map((option: any, index: number) => {
          const { feature_name, billing_units, quantity, price } = option;
          return (
            <PriceItem key={feature_name}>
              <span>{feature_name}</span>
              <QuantityInput
                key={feature_name}
                value={quantity ? quantity / billing_units : ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const newOptions = [...options];
                  newOptions[index].quantity =
                    parseInt(e.target.value) * billing_units;
                  setOptions(newOptions);
                }}
              >
                <span className="text-muted-foreground">
                  × ${price} per {billing_units === 1 ? " " : billing_units}{" "}
                  {feature_name}
                </span>
              </QuantityInput>
            </PriceItem>
          );
        })}
      {preview && preview.due_today && (
        <PriceItem className="font-semibold">
          <span>Due today</span>
          <span>
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: preview.due_today.currency,
            }).format(getTotalPrice())}
          </span>
        </PriceItem>
      )}
    </div>
  );
};
