import { cn } from "@/lib/utils";

export const Row = ({
  children,
  className,
  type,
  onClick,
  isOnboarding = false,
  ...props
}: {
  children?: React.ReactNode;
  className?: string;
  type?: "header" | "body";
  onClick?: () => void;
  isOnboarding?: boolean;
  props?: React.ComponentProps<"div">;
}) => {
  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(auto-fit,_minmax(0,_1fr))] gap-2 w-full px-10 h-8 items-center hover:bg-primary/5 whitespace-nowrap",
        type === "header" &&
          "text-xs text-t3 h-8 -mb-1 items-center hover:bg-primary/0",
        isOnboarding && "px-2",
        className,
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
};

export const Item = ({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "col-span-1 flex h-full w-full items-center gap-2 truncate",
        className,
      )}
    >
      {children}
    </div>
  );
};

//header
// export const TableGridHeader = ({
//   children,
//   className,
// }: {
//   children: React.ReactNode;
//   className?: string;
// }) => {
//   return (
//     <div
//       className={cn(
//         "grid grid-cols-[repeat(auto-fit,_minmax(0,_1fr))] gap-8 w-full",
//         className
//       )}
//     >
//       {children}
//     </div>
//   );
// };

// export const TableGridBody = ({
//   children,
//   className,
// }: {
//   children: React.ReactNode;
//   className?: string;
// }) => {
//   return (
//     <div
//       className={cn(
//         "grid grid-cols-[repeat(auto-fit,_minmax(0,_1fr))] gap-8 w-full",
//         className
//       )}
//     >
//       {children}
//     </div>
//   );
// };
