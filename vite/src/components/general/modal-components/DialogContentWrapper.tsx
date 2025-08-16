import { DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const CustomDialogContent = ({
  children,
  fromTop = true,
  setStep,
  className,
}: {
  children: React.ReactNode;
  fromTop?: boolean;
  setStep?: (step: any) => void;
  className?: string;
}) => {
  return (
    <DialogContent
      className={cn(
        "flex flex-col gap-0 !p-0 overflow-y-auto",
        fromTop &&
          "translate-y-[0%] top-[20%] max-h-[70vh] overflow-y-hidden duration-0",
        className
      )}
    >
      {children}
    </DialogContent>
  );
};

export const CustomDialogBody = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn(" flex flex-col !p-6 gap-4 rounded-sm", className)}>
      {children}
    </div>
  );
};

export const CustomDialogFooter = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "w-full bg-stone-100 flex items-center h-10 gap-0 border-t border-zinc-200 justify-end",
        className
      )}
    >
      {children}
    </div>
  );
};
