export const ProductOptions = ({
  options,
  setOptions,
}: {
  options: any[];
  setOptions: (options: any[]) => void;
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
          <p className="text-sm font-mono text-t3">{option.feature_id}</p>
          <div className="flex gap-4">
            {option.quantity !== undefined && option.quantity !== null && (
              <div className="flex items-center gap-2">
                <p className="text-sm text-t1 font-mono">{option.quantity}</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
