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
          "rounded-md !h-full !w-6 hover:translate-x-0.5 transition-all duration-100 !bg-transparent !cursor-pointer",
          props?.className
        )}
        {...props}
      >
        <FontAwesomeIcon icon={faEllipsisVertical} size="sm" className="w-3" />
      </Button>
    );
  }
);
