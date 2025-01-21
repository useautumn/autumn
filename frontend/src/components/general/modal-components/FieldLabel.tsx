import { cn } from "@/lib/utils";
import React from "react";

function FieldLabel({ children, className }: any) {
  return (
    <div className={cn("text-t3 text-sm mb-2", className)}>{children}</div>
  );
}

export default FieldLabel;
