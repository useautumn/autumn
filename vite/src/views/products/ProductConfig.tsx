import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Product } from "@autumn/shared";
import { useState } from "react";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { Pencil } from "lucide-react";

export const ProductConfig = ({
  product,
  setProduct,
  isUpdate = false,
}: {
  product: any;
  setProduct: (product: any) => void;
  isUpdate?: boolean;
}) => {
  const [idEdit, setIdEdit] = useState(false);

  return (
    <>
      <div className="flex w-full gap-2">
        <div className="w-full">
          <FieldLabel>Name</FieldLabel>
          <Input
            placeholder="eg. Starter Product"
            value={product.name}
            onChange={(e) => {
              const newFields = { ...product, name: e.target.value };
              if (!idEdit) {
                newFields.id = slugify(e.target.value);
              }
              setProduct(newFields);
            }}
          />
        </div>
        <div className="w-full">
          <FieldLabel>ID</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              autoFocus={idEdit}
              placeholder="eg. Product ID"
              disabled={!idEdit}
              className="disabled:bg-transparent disabled:border-none disabled:shadow-none"
              value={product.id}
              onChange={(e) => {
                setProduct({ ...product, id: e.target.value });
              }}
            />
            <Pencil
              size={12}
              className="text-t3 cursor-pointer w-8 h-8 px-2 "
              onClick={() => setIdEdit(true)}
            />
          </div>
        </div>
      </div>
      {/* <div className="flex w-full gap-2">
        <div className="w-full">
          <FieldLabel>Group</FieldLabel>
          <Input
            placeholder="eg. Product Group"
            value={product.group}
            onChange={(e) => setProduct({ ...product, group: e.target.value })}
          />
        </div>
        <div className="w-full"></div>
      </div>
      <div className="flex flex-col gap-2 text-xs">
        <div className="flex items-center gap-2 ml-1 text-t2">
          <Checkbox
            // size="sm"
            checked={product.is_add_on}
            onCheckedChange={(e) =>
              setProduct({ ...product, is_add_on: e as boolean })
            }
          />
          <p className="mt-[1px]">This product is an add-on</p>
        </div>
        <div className="flex items-center gap-2 ml-1 text-t2">
          <Checkbox
            checked={product.is_default}
            onCheckedChange={(e) =>
              setProduct({ ...product, is_default: e as boolean })
            }
          />
          <p className="mt-[1px]">
            Add this product to customers by default on creation
          </p>
        </div>
      </div> */}
    </>
  );
};
