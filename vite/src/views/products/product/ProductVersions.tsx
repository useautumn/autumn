import { getRedirectUrl } from "@/utils/genUtils";
import { useProductContext } from "./ProductContext";
import { useNavigate } from "react-router";
import { useEnv } from "@/utils/envUtils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const ProductVersions = () => {
  const { product, numVersions, customerData, version } = useProductContext();
  const navigate = useNavigate();
  const env = useEnv();

  return (
    <div className="flex justify-between gap-4 w-full text-xs">
      <div className="flex flex-col w-full gap-2">
        <div className="flex items-center w-full justify-between h-4">
          <p className="text-xs text-t3 font-medium text-center">
            Latest Version{" "}
          </p>
          <p className="text-xs text-t2 ">v{numVersions}</p>
        </div>
        <div className="flex items-center w-full justify-between h-4">
          <p className="text-xs text-t3 font-medium text-center">Created At </p>
          <p className="text-xs text-t2 ">29 Mar</p>
        </div>
        <div className="flex items-center w-full justify-between h-4">
          <p className="text-xs text-t3 font-medium text-center">
            Version History{" "}
          </p>
          <Select
            value={version ? version.toString() : product.version.toString()}
            onValueChange={async (value) => {
              navigate(
                getRedirectUrl(
                  `${
                    customerData
                      ? `/customers/${customerData.customer.id}`
                      : "/products"
                  }/${product.id}?version=${value}`,
                  env
                )
              );
            }}
          >
            <SelectTrigger className="h-7 w-fit text-xs bg-white">
              <SelectValue placeholder="Select version" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: numVersions }, (_, i) => i + 1)
                .reverse()
                .map((version) => (
                  <SelectItem
                    key={version}
                    value={version.toString()}
                    className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-xs"
                    onClick={() => {
                      navigate(
                        getRedirectUrl(
                          `${
                            customerData
                              ? `/customers/${customerData.customer.id}`
                              : "/products"
                          }/${product.id}?version=${version}`,
                          env
                        )
                      );
                    }}
                  >
                    v{version}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
