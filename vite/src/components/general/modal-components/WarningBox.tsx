import { cn } from "@/lib/utils";

export const WarningBox = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  return (
    <p
      className={cn(
        "rounded-sm px-2 py-1 bg-yellow-100 border border-yellow-500 text-yellow-500 text-xs min-h-8 flex items-center",
        className
      )}
    >
      {children}
    </p>
  );
};
