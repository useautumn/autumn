import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  faBarsFilter,
  faCheck,
  faXmark,
} from "@fortawesome/pro-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCustomersContext } from "./CustomersContext";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";

function FilterButton() {
  const { filters, setFilters, products } = useCustomersContext();

  return (
    <DropdownMenu>
      <RenderFilterTrigger />

      <DropdownMenuContent className="w-56" align="start">
        {/* Search filter properties */}
        <DropdownMenuLabel>Filter</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* 1. Status filter */}

        <FilterStatus />
        {/* 2. Product filter */}
        <ProductStatus />

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => setFilters({})}
            className="cursor-pointer"
          >
            <FontAwesomeIcon icon={faXmark} className="mr-2 text-t3" />
            Clear
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default FilterButton;

export const FilterStatus = () => {
  const { filters, setFilters } = useCustomersContext();
  const statuses = ["canceled", "free_trial"];

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-t3 !font-regular text-xs">
        Status
      </DropdownMenuLabel>
      {statuses.map((status: any) => {
        const isActive = filters?.status === status;
        return (
          <DropdownMenuItem
            key={status}
            onClick={() => {
              if (isActive) {
                setFilters({ ...filters, status: undefined });
              } else {
                setFilters({ ...filters, status });
              }
            }}
            className="flex items-center justify-between cursor-pointer text-sm"
          >
            {keyToTitle(status)}
            {isActive && (
              <FontAwesomeIcon size="sm" icon={faCheck} className="text-t3" />
            )}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuGroup>
  );
};

export const ProductStatus = () => {
  const { filters, setFilters, products } = useCustomersContext();
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-t3 !font-regular text-xs">
        Product
      </DropdownMenuLabel>
      {products.map((product: any) => {
        const isActive = filters?.product_id === product.id;
        return (
          <DropdownMenuItem
            key={product.id}
            onClick={() => {
              if (isActive) {
                setFilters({ ...filters, product_id: undefined });
              } else {
                setFilters({ ...filters, product_id: product.id });
              }
            }}
            className="flex items-center justify-between cursor-pointer"
          >
            {product.name}
            {isActive && (
              <FontAwesomeIcon size="sm" icon={faCheck} className="text-t3" />
            )}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuGroup>
  );
};

export const RenderFilterTrigger = ({ setOpen }: any) => {
  return (
    <DropdownMenuTrigger asChild>
      <Button variant="outline" className="text-t3">
        <FontAwesomeIcon icon={faBarsFilter} className="mr-2 text-t3" />
        Filter
      </Button>
    </DropdownMenuTrigger>
  );
};

// export const FilterField = ({ field, type, options }: any) => {
//   // TODO: Create function to get field name
//   const { filter, setFilter } = useCustomersContext();

//   if (type == "select") {
//     return (
//       <DropdownMenuSub>
//         <DropdownMenuSubTrigger>{field}</DropdownMenuSubTrigger>
//         <DropdownMenuPortal>
//           <DropdownMenuSubContent>
//             {options.map((option: any) => (
//               <DropdownMenuItem
//                 key={option}
//                 onClick={() => setFilter({ [field]: option })}
//               >
//                 {keyToTitle(option)}
//               </DropdownMenuItem>
//             ))}
//           </DropdownMenuSubContent>
//         </DropdownMenuPortal>
//       </DropdownMenuSub>
//     );
//   }
// };
