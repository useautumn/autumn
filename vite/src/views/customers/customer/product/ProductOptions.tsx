import { Input } from "@/components/ui/input";

export const ProductOptions = ({
  options,
  setOptions,
  oneTimePurchase,
}: {
  options: any[];
  setOptions: (options: any[]) => void;
  oneTimePurchase: boolean;
}) => {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between border-y bg-stone-100 px-10 rounded-md h-8 w-full">
        <h2 className="text-sm text-t2 font-medium col-span-2 flex whitespace-nowrap">
          Billing Quantity
        </h2>
      </div>

      {options.map((option) => (
        <div
          key={option.internal_feature_id}
          className="flex gap-16 rounded-md h-10 px-10 items-center "
        >
          <p className="text-sm text-t1 font-mono text-t3">
            {option.feature_id}
          </p>
          <div className="flex gap-4">
            {option.quantity !== undefined && option.quantity !== null && (
              <div className="flex items-center gap-2">
                {/* <label
                  htmlFor={`quantity-${option.internal_feature_id}`}
                  className="text-sm text-t2"
                >
                  Billing Quantity
                </label> */}
                <p className="text-sm text-t1 font-mono">{option.quantity}</p>
                {/* <Input
                  id={`quantity-${option.internal_feature_id}`}
                  value={option.quantity}
                  type="number"
                  onChange={(e) => {
                    const newOptions = options.map((o) =>
                      o.internal_feature_id === option.internal_feature_id
                        ? {
                            ...o,
                            quantity: parseInt(e.target.value) || 0,
                          }
                        : o
                    );

                    setOptions(newOptions);
                  }}
                  className="w-24 h-8"
                  disabled={oneTimePurchase}
                /> */}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
