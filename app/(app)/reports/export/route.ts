import { NextResponse, type NextRequest } from "next/server";
import { withUser } from "@/lib/db";
import { listDebts } from "@/lib/queries";
import { debtsCsv, paymentsCsv, settlementsCsv } from "@/lib/reports";
import { todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

const BUILDERS = { debts: debtsCsv, payments: paymentsCsv, settlements: settlementsCsv } as const;

/** CSV download of the signed-in user's own data. Sign-in is required by the middleware and by withUser(). */
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") ?? "";
  if (!(kind in BUILDERS)) return NextResponse.json({ error: "Unknown export" }, { status: 400 });
  const debts = await withUser((db) => listDebts(db));
  const csv = BUILDERS[kind as keyof typeof BUILDERS](debts);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="debt-${kind}-${todayISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
