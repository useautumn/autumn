import { Check } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "@/lib/utils";
import { Switch } from "../ui/switch";
import { InfoTooltip } from "./modal-components/InfoTooltip";

export const ToggleButton = ({
  value,
  setValue,
  tooltipContent,
  buttonText,
  className,
  disabled,
  infoContent,
}: {
  value: boolean;
  setValue: (value: boolean) => void;
  tooltipContent?: string;
  buttonText?: string;
  className?: string;
  disabled?: boolean;
  infoContent?: string;
}) => {
  const MainButton = (
    <Button
      variant="outline"
      disabled={disabled}
      onClick={() => setValue(!value)}
      className={cn(
        `flex justify-start items-center hover:bg-transparent bg-transparent border-none shadow-none gap-2 w-fit p-0`,
        className
      )}
    >
      {buttonText}
      {infoContent && <InfoTooltip>{infoContent}</InfoTooltip>}
      <Switch
        checked={value}
        onCheckedChange={setValue}
        className="h-4 w-7 data-[state=checked]:bg-stone-500"
        thumbClassName="h-3 w-3 data-[state=checked]:translate-x-3"
      />
    </Button>
  );

  if (tooltipContent) {
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{MainButton}</TooltipTrigger>
        <TooltipContent>{tooltipContent}</TooltipContent>
      </Tooltip>
    );
  }

  return MainButton;
};
