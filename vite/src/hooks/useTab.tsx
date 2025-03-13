import { useLocation } from "react-router";

export const useTab = () => {
  const { pathname } = useLocation();
  if (
    pathname.startsWith("/features") ||
    pathname.startsWith("/sandbox/features")
  ) {
    return "features";
  } else if (
    pathname.startsWith("/products") ||
    pathname.startsWith("/sandbox/products")
  ) {
    return "products";
  } else if (
    pathname.startsWith("/customers") ||
    pathname.startsWith("/sandbox/customers")
  ) {
    return "customers";
  } else if (
    pathname.startsWith("/dev") ||
    pathname.startsWith("/sandbox/dev")
  ) {
    return "dev";
  } else {
    return "";
  }
};
