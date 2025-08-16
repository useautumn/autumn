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
import { CountAndMigrate } from "./versioning/CountAndMigrate";
import { formatUnixToDate } from "@/utils/formatUtils/formatDateUtils";

export const ProductVersions = () => {
  const { product, numVersions, customer, version } = useProductContext();
  const navigate = useNavigate();
  const env = useEnv();

  return (
    <div className="flex justify-between gap-4 w-full text-xs">
      <div className="flex flex-col w-full gap-4">
        <div className="flex items-center w-full justify-between h-4">
          <p className=" text-t3 font-medium text-center">Latest Version </p>
          <p className="text-sm text-t2 pr-2">v{numVersions}</p>
        </div>
        <div className="flex items-center w-full justify-between h-4">
          <p className=" text-t3 font-medium text-center">Created At </p>
          <p className=" text-sm text-t2 pr-2">
            {formatUnixToDate(product.created_at, true)}
          </p>
        </div>
        <div className="flex items-center w-full justify-between h-4">
          <p className=" text-t3 font-medium text-center">Version History </p>
          {numVersions > 1 ? (
            <Select
              value={version ? version.toString() : product.version.toString()}
              onValueChange={async (value) => {
                navigate(
                  getRedirectUrl(
                    `${customer ? `/customers/${customer.id}` : "/products"}/${
                      product.id
                    }?version=${value}`,
                    env
                  )
                );
              }}
            >
              <SelectTrigger
                className="text-sm pr-1 mr-1 h-6 w-14 "
                iconClassName="size-4 p-0"
              >
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent className="min-w-0 w-16" side="bottom" align="end">
                {Array.from({ length: numVersions }, (_, i) => i + 1)
                  .reverse()
                  .map((version) => (
                    <SelectItem
                      key={version}
                      value={version.toString()}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer w-full"
                      onClick={() => {
                        navigate(
                          getRedirectUrl(
                            `${
                              customer
                                ? `/customers/${customer.id}`
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
          ) : (
            <p className="text-sm text-t3 pr-2">None</p>
          )}
        </div>
        {!customer && <CountAndMigrate />}
      </div>
    </div>
  );
};
