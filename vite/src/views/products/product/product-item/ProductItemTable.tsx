import UpdateProductItem from "./UpdateProductItem";
import { ProductItem } from "@autumn/shared";
import { useProductContext } from "../ProductContext";
import { CreateProductItem } from "./CreateProductItem";
import { ProductItemRow } from "./ProductItemRow";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { EllipsisVertical, SaveIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { EntitiesDropdownContent } from "./EntitiesDropdown";
import { CreateFreeTrial } from "../free-trial/CreateFreeTrial";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";

export const ProductItemTable = () => {
  const { product, features, org, entityFeatureIds, isOnboarding, autoSave } =
    useProductContext();

  const [selectedItem, setSelectedItem] = useState<ProductItem | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [freeTrialOpen, setFreeTrialOpen] = useState(false);

  const handleRowClick = (item: ProductItem, index: number) => {
    setSelectedItem(item);
    setSelectedIndex(index);
    setOpen(true);
  };

  // Group product items by entity_feature_id, and also include items where feature_id matches
  const groupedItems = entityFeatureIds.reduce(
    (acc: Record<string, ProductItem[]>, entityFeatureId: string) => {
      acc[entityFeatureId] = product.items.filter(
        (item: ProductItem) => item.entity_feature_id === entityFeatureId
      );
      return acc;
    },
    {} as Record<string, ProductItem[]>
  );

  return (
    <>
      <UpdateProductItem
        selectedItem={selectedItem}
        selectedIndex={selectedIndex}
        setSelectedItem={setSelectedItem}
        open={open}
        setOpen={setOpen}
      />
      <div className="flex flex-col text-sm rounded-sm">
        <div
          className={cn(
            "flex items-center justify-between border-y bg-stone-100 pl-10 h-10",
            isOnboarding && "pl-2 !border-b !border-t-0"
          )}
        >
          <h2 className="text-sm text-t2 font-medium  flex whitespace-nowrap">
            Product Items
          </h2>

          <div className="flex w-full h-full items-center justify-end">
            {!isOnboarding && (
              <>
                <CreateProductItem />
                <DropdownMenu
                  open={dropdownOpen}
                  onOpenChange={setDropdownOpen}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="add"
                      disableStartIcon
                      startIcon={<EllipsisVertical size={16} />}
                      className={cn(
                        "w-10 h-10 p-0 text-purple-600 hover:text-purple-700 hover:bg-purple-50",
                        isOnboarding && "!h-full",
                        isOnboarding && product.items.length == 0 && "hidden"
                      )}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36 max-w-36">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="flex items-center gap-2">
                        Add Entity
                        <InfoTooltip>
                          <p>
                            Add an entity to group items by (eg, usage limits
                            per users, compute instances, etc).
                          </p>
                        </InfoTooltip>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="max-w-52">
                        <EntitiesDropdownContent />
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem
                      onClick={() => {
                        setDropdownOpen(false);
                        setFreeTrialOpen(true);
                      }}
                    >
                      Add Free Trial
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <CreateFreeTrial
                  open={freeTrialOpen}
                  setOpen={setFreeTrialOpen}
                />
              </>
            )}

            {/* </div> */}
          </div>
        </div>

        <div
          className={cn(
            "flex flex-col",
            isOnboarding && "overflow-y-auto max-h-[200px]"
          )}
        >
          {/* Original product items mapping - excluding items that appear in grouped sections */}
          {product.items
            .filter(
              (item: ProductItem) =>
                !entityFeatureIds.some(
                  (entityFeatureId: string) =>
                    item.entity_feature_id === entityFeatureId
                )
            )
            .map((item: ProductItem, index: number) => (
              <ProductItemRow
                key={index}
                item={item}
                index={product.items.indexOf(item)} // Use indexOf to maintain correct index reference
                isOnboarding={isOnboarding}
                features={features}
                org={org}
                onRowClick={handleRowClick}
              />
            ))}

          {/* Grouped items with separators */}
          {entityFeatureIds.map((entityFeatureId: string) => (
            <div key={entityFeatureId}>
              {/* Separator for each entityFeatureId */}
              <div
                className={cn(
                  "flex items-center bg-stone-50 border-b pl-10 pr-10 h-5 relative mb-2",
                  isOnboarding && "px-2 bg-white"
                )}
              >
                <h3
                  className={cn(
                    "text-t2 font-medium uppercase text-xs font-mono tracking-widest absolute top-3.5 bg-stone-50 px-3 left-7",
                    isOnboarding && "bg-white"
                  )}
                >
                  {entityFeatureId}
                </h3>
              </div>

              {/* Filtered items for this entityFeatureId */}
              {groupedItems[entityFeatureId]?.map(
                (item: ProductItem, index: number) => (
                  <ProductItemRow
                    key={`${entityFeatureId}-${index}`}
                    item={item}
                    index={product.items.indexOf(item)}
                    isOnboarding={isOnboarding}
                    features={features}
                    org={org}
                    onRowClick={handleRowClick}
                  />
                )
              )}

              {/* Show message if no items for this entityFeatureId */}
              {groupedItems[entityFeatureId]?.length === 0 && (
                <div
                  className={cn(
                    "flex items-center pl-10 pr-10 h-12 text-t3 text-sm",
                    isOnboarding && "pl-2 pr-2"
                  )}
                >
                  Add the features this entity gets access to
                </div>
              )}
            </div>
          ))}

          {product.items.length === 0 && (
            <div
              className={cn(
                "flex flex-col px-10 h-full my-2",
                isOnboarding && "px-2"
              )}
            >
              <p className="text-t3">
                Product items determine what customers get access to and how
                they're billed. Start by adding one.
              </p>
              {/* <p className="text-t3">
                Product items determine what customers get access to and how
                they're billed{" "}
                <a
                  href="https://docs.useautumn.com/products/create-product"
                  target="_blank"
                  className="underline "
                >
                  learn more:
                </a>
              </p>
              <div className="flex flex-col gap-2 px-4 mt-2">
                <p className="text-t3">
                  ↳ <span className="font-medium text-t2">Features:</span>{" "}
                  features included with this product (eg, 100 credits per
                  month)
                </p>
                <p className="text-t3">
                  ↳ <span className="font-medium text-t2">Prices:</span> a fixed
                  price to charge customers (eg, $10 per month)
                </p>
                <p className="text-t3">
                  ↳{" "}
                  <span className="font-medium text-t2">Priced Features:</span>{" "}
                  features that have a price based on usage (eg, $1 per credit)
                </p>
              </div> */}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
