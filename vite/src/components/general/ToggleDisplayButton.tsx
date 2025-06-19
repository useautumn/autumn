import { cn } from "@/lib/utils";

import { Button } from "../ui/button";

export const ToggleDisplayButton = ({
  show,
  disabled,
  onClick,
  children,
  className,
}: any) => {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "text-muted-foreground w-fit",
        show && "bg-primary/5 text-foreground hover:bg-primary/10",
        className
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
};
