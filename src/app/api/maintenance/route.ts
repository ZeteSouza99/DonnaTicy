import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { runMaintenance } from "@/services/maintenance-service";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
 const secret = serverEnv().CRON_SECRET;
 const received = Buffer.from(request.headers.get("authorization") ?? "");
 const expected = Buffer.from(`Bearer ${secret ?? ""}`);
 if(!secret || received.length !== expected.length || !timingSafeEqual(received,expected)) return NextResponse.json({ error: { message: "Não autorizado.", code: "UNAUTHORIZED" } },{status:401});
 const started = Date.now(), maintenance = await runMaintenance();
 const ok = Object.values(maintenance).every((value) => value !== null);
 console.info(JSON.stringify({ scope: "maintenance", ok, durationMs: Date.now()-started, ...maintenance }));
 return NextResponse.json({ ok, maintenance }, { status: ok ? 200 : 503, headers: { "Cache-Control":"no-store" } });
}
