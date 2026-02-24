import { sql } from "kysely";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  try {
    // Delete related records first (sessions, accounts), then user
    await sql`DELETE FROM session WHERE "userId" = ${id}`.execute(db);
    await sql`DELETE FROM account WHERE "userId" = ${id}`.execute(db);
    await sql`DELETE FROM "user" WHERE id = ${id}`.execute(db);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete user:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 },
    );
  }
}
