import type { FormEvent, ReactNode } from "react";

export const FormRow = ({
  onSubmit,
  children,
}: {
  onSubmit: () => void;
  children: ReactNode;
}) => (
  <form
    className="flex flex-wrap items-end gap-2"
    onSubmit={(e: FormEvent) => {
      e.preventDefault();
      onSubmit();
    }}
  >
    {children}
  </form>
);
