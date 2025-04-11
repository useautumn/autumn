import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { navigateTo } from "@/utils/genUtils";

import { useNavigate } from "react-router";
import { useProductContext } from "../ProductContext";
import { useEnv } from "@/utils/envUtils";

export default function ProductViewBreadcrumbs() {
  let { product } = useProductContext();
  let env = useEnv();
  let navigate = useNavigate();

  return (
    <Breadcrumb className="text-t3 pt-6 pl-10 flex justify-center">
      <BreadcrumbList className="text-t3 text-xs w-full">
        <BreadcrumbItem
          onClick={() => navigateTo("/products", navigate, env)}
          className="cursor-pointer"
        >
          Products
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem className="cursor-pointer">
          {product.name ? product.name : product.id}
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
