import { ColumnDef, Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import CopyButton from "@/components/general/CopyButton";
import { format } from "date-fns";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { impersonateUser } from "./adminUtils";
import { ImpersonateButton } from "./components/ImpersonateBtn";

export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  lastSignedIn: string;
};

// Helper to add width and canCopy to columns
interface ExtraColumnOptions {
  width?: string | number;
  canCopy?: boolean;
}

type UserColumnDef = ColumnDef<User> & ExtraColumnOptions;

export const columns: UserColumnDef[] = [
  {
    accessorKey: "id",
    header: "ID",
    width: 60,
    canCopy: true,
    cell: ({ row }: { row: Row<User> }) => {
      const value = row.getValue("id") as string;
      return (
        <div>
          <CopyButton className="text-xs" text={value}></CopyButton>
        </div>
      );
    },
  },
  {
    accessorKey: "name",
    header: "Name",
    width: 150,
    cell: ({ row }: { row: Row<User> }) => {
      const value = row.getValue("name") as string;
      return <div>{value}</div>;
    },
  },
  {
    accessorKey: "email",
    header: "Email",
    canCopy: true,
    width: 200,
    cell: ({ row }: { row: Row<User> }) => {
      const value = row.getValue("email") as string;
      return (
        <CopyButton className="max-w-40 text-xs overflow-hidden" text={value}>
          {value}
        </CopyButton>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: "Created At",
    width: 150,
    cell: ({ row }: { row: Row<User> }) => {
      const value = row.getValue("createdAt");

      return (
        <span className="w-30">
          {format(new Date(value as string), "dd MMM HH:mm")}
        </span>
      );
    },
  },

  {
    id: "impersonate",
    header: "Impersonate",
    width: "100%",
    cell: ({ row }: { row: Row<User> }) => (
      <ImpersonateButton userId={row.original.id} />
    ),
    enableSorting: false,
    enableHiding: false,
  },
];
