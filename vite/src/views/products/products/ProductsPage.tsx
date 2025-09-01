import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { Badge } from "@/components/ui/badge";
import { parseAsBoolean, useQueryStates } from "nuqs";
import CreateProduct from "./CreateProduct";
import { ProductsTable } from "../ProductsTable";

export const ProductsPage = () => {
  const [{ showArchived }] = useQueryStates(
    {
      showArchived: parseAsBoolean.withDefault(false),
    },
    {
      history: "push",
    }
  );

  return (
    <div>
      <PageSectionHeader
        title="Products"
        titleComponent={
          <>
            <span className="text-t2 px-1 rounded-md bg-stone-200 mr-2">
              {/* {data?.products?.length} */}
            </span>
            {showArchived && (
              <Badge className="shadow-none bg-yellow-100 border-yellow-500 text-yellow-500 hover:bg-yellow-100">
                Archived
              </Badge>
            )}
          </>
        }
        addButton={<CreateProduct />}
        // menuComponent={
        //   <HamburgerMenu
        //     dropdownOpen={dropdownOpen}
        //     setDropdownOpen={setDropdownOpen}
        //     actions={[
        //       {
        //         type: "item",
        //         label: showArchived
        //           ? `Show active products`
        //           : `Show archived products`,
        //         onClick: () => setShowArchived((prev) => !prev),
        //       },
        //     ]}
        //   />
        // }
      />
      <ProductsTable />
    </div>
  );
};
