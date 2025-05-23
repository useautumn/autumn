import { cn } from "@/lib/utils";

export const PageSectionHeader = ({
  title,
  isOnboarding = false,
  addButton,
  className,
}: {
  title: string;
  isOnboarding?: boolean;
  addButton?: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 border-y bg-stone-100 pl-10 pr-7 h-10 flex justify-between items-center",
        isOnboarding && "px-2",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm text-t2 font-medium">{title}</h2>
      </div>
      {addButton && <div className="flex items-center">{addButton}</div>}
    </div>
  );
};
