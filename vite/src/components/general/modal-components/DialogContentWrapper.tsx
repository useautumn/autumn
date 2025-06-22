export const DialogContentWrapper = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return <div className="p-6 flex flex-col gap-4 rounded-sm">{children}</div>;
};
