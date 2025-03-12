import React from "react";
import { useAddProductContext } from "./CreateCheckoutContext";
import { BillingType, PriceType } from "@autumn/shared";
import { Input } from "@/components/ui/input";

const PriceOptions = ({ price }: { price: any }) => {
  const { optionsList, setOptionsList } = useAddProductContext();
  const isFixed = price.type == PriceType.Fixed;
  const config = price.config;

  const priceOption = optionsList.find((option) => option.id === price.id);
  const handleOptionChange = (option: any) => {
    const newOptions = [...optionsList];
    const index = newOptions.findIndex((item) => item.id === price.id);
    newOptions[index] = { ...newOptions[index], options: option };
    setOptionsList(newOptions);
  };

  if (isFixed) {
    return (
      <p className="text-t2">
        {config.amount} / {config.interval}
      </p>
    );
  }

  if (price.billing_type == BillingType.UsageBelowThreshold) {
    return (
      <Input
        className="w-32"
        type="number"
        placeholder="Threshold"
        value={priceOption?.options?.threshold}
        onChange={(e) => handleOptionChange({ threshold: e.target.value })}
      />
    );
  }
  return <div>{price.name}</div>;
};

function ConfigurePriceOptions() {
  const { optionsList, selectedProduct } = useAddProductContext();

  const priceToName = (price: any) => {
    const name = selectedProduct?.prices.find(
      (p: any) => p.id === price.id
    )?.name;
    return name;
  };

  const idToPrice = (id: string) => {
    return selectedProduct?.prices.find((p: any) => p.id === id);
  };

  return (
    <div>
      {optionsList.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md bg-zinc-100 p-4">
          {optionsList.map((option) => (
            <div
              key={option.id}
              className="flex justify-between items-center text-sm rounded-md h-7"
            >
              <p className="text-t2">{priceToName(option)}</p>
              <PriceOptions price={idToPrice(option.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ConfigurePriceOptions;

// export const AddPriceDropdown = () => {
//   const { options, setOptions, selectedProduct } = useAddProductContext();

//   const handleAddPrice = (price: any) => {
//     const newOptions = [...options];
//     newOptions.push({ id: price.id, options: {} });
//     setOptions(newOptions);
//   };

//   const filteredPrices = selectedProduct?.prices.filter(
//     (price) => !options.some((item) => item.id === price.id)
//   );

//   return (
//     <DropdownMenu>
//       <DropdownMenuTrigger asChild>
//         <Button variant="outline" startIcon={<PlusIcon size={16} />}>
//           Add Price
//         </Button>
//       </DropdownMenuTrigger>
//       <DropdownMenuContent>
//         {filteredPrices.length > 0 ? (
//           filteredPrices.map((price) => (
//             <DropdownMenuItem
//               key={price.id}
//               onClick={() => handleAddPrice(price)}
//             >
//               {price.name}
//             </DropdownMenuItem>
//           ))
//         ) : (
//           <DropdownMenuItem className="text-t3">
//             No prices found
//           </DropdownMenuItem>
//         )}
//       </DropdownMenuContent>
//     </DropdownMenu>
//   );
// };
