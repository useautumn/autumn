import { useProductContext } from "@/views/products/product/ProductContext";
import React from "react";
import { AttachNewItems } from "./attach-preview/AttachNewItems";
import { DueToday } from "./attach-preview/DueToday";
import { DueNextCycle } from "./attach-preview/DueNextCycle";

export const AttachPreviewDetails = () => {
  const { org, attachState } = useProductContext();
  const { preview } = attachState;

  if (!preview) {
    return null;
  }

  return (
    <React.Fragment>
      <DueToday />
      <AttachNewItems />
      <DueNextCycle />
    </React.Fragment>
  );
};
