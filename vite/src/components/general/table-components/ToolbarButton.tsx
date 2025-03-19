import { Button, ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/pro-regular-svg-icons";
import { forwardRef } from "react";

export const ToolbarButton = forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => {
    return (
      <Button
        ref={ref}
        isIcon
        variant="ghost"
        className={cn(
          "rounded-lg !h-5 !w-5 transition-all duration-100 hover:bg-stone-50",
          props?.className
        )}
        {...props}
      >
        <FontAwesomeIcon icon={faEllipsisVertical} size="sm" className="w-3" />
      </Button>
    );
  }
);
