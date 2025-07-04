import { ColumnDef, Row } from "@tanstack/react-table";
import CopyButton from "@/components/general/CopyButton";
import { format } from "date-fns";
import { User } from "better-auth";
import { ImpersonateButton } from "./components/ImpersonateBtn";

export type Org = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  users: User[];
};

// Helper to add width and canCopy to columns
interface ExtraColumnOptions {
  width?: string | number;
  canCopy?: boolean;
}

type OrgColumnDef = ColumnDef<Org> & ExtraColumnOptions;

export const columns: OrgColumnDef[] = [
  {
    accessorKey: "id",
    header: "ID",
    width: 60,
    canCopy: true,
    cell: ({ row }: { row: Row<Org> }) => {
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
    cell: ({ row }: { row: Row<Org> }) => {
      const value = row.getValue("name") as string;
      return <div>{value}</div>;
    },
  },

  {
    accessorKey: "slug",
    header: "Slug",
    canCopy: true,
    width: 200,
    cell: ({ row }: { row: Row<Org> }) => {
      const value = row.getValue("slug") as string;
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
    cell: ({ row }: { row: Row<Org> }) => {
      const value = row.getValue("createdAt");
      return (
        <span className="w-30">
          {format(new Date(value as string), "dd MMM HH:mm")}
        </span>
      );
    },
  },
  {
    accessorKey: "impersonate",
    header: "Impersonate",
    width: 150,
    cell: ({ row }: { row: Row<Org> }) => {
      const users = row.getValue("users") as User[];

      if (!users || users.length === 0) {
        return null;
      }

      return <ImpersonateButton userId={users?.[0]?.id} />;
    },
  },
  {
    accessorKey: "users",
    header: "Users",
    width: "100%",
    cell: ({ row }: { row: Row<Org> }) => {
      const value = row.getValue("users");
      return (
        <span className="truncate">
          {(value as User[]).map((user) => user.email)}
        </span>
      );
    },
  },
];
