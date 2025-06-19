import { cn } from "@/lib/utils";

export const PageSectionHeader = ({
  title,
  titleComponent,
  isOnboarding = false,
  addButton,
  className,
  classNames,
}: {
  title?: string;
  titleComponent?: React.ReactNode;
  isOnboarding?: boolean;
  addButton?: React.ReactNode;
  className?: string;
  classNames?: {
    title?: string;
  };
}) => {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 border-y bg-surface-3 pl-10 pr-7 h-10 flex justify-between items-center",
        isOnboarding && "px-2",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {title && (
          <h2 className={cn("text-sm text-t2 font-medium", classNames?.title)}>
            {title}
          </h2>
        )}
        {titleComponent}
      </div>
      {addButton && <div className="flex items-center">{addButton}</div>}
    </div>
  );
};
