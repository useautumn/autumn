import { Check } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "@/lib/utils";

export const ToggleButton = ({
  value,
  setValue,
  tooltipContent,
  buttonText,
  className,
}: {
  value: boolean;
  setValue: (value: boolean) => void;
  tooltipContent?: string;
  buttonText?: string;
  className?: string;
}) => {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          onClick={() => setValue(!value)}
          className={cn(
            `flex items-center gap-2`,
            value && "bg-surface-3",
            className,
          )}
        >
          {value && (
            <div className="w-3 h-3 bg-lime-500 rounded-full flex items-center justify-center">
              <Check className="w-2 h-2 text-white" />
            </div>
          )}
          {buttonText}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltipContent}</TooltipContent>
    </Tooltip>
  );
};
