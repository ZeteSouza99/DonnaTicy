import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { parseSpreadsheet, type ParsedRow } from "@/lib/import/spreadsheet-parser";
import { executeImport, type ImportSummary } from "@/lib/import/run-import";
import { createAuditLogTx } from "@/lib/audit";

const emptySummary: ImportSummary = { invoicesProcessed: 0, invoicesCreated: 0, invoicesUpdated: 0, productsCreated: 0, productsUpdated: 0, variantsCreated: 0, variantsUpdated: 0, stockEntered: 0, totalUnits: 0, errors: [] };
const publicJob = { id: true, fileName: true, status: true, dryRun: true, total: true, processed: true, summary: true, parseErrors: true, error: true, createdAt: true, updatedAt: true } as const;
const invoiceKey = (row: ParsedRow) => `${row.invoiceNumber}::${row.supplierName}`;
export async function createImportJob(userId: string, file: File, dryRun: boolean) {
  if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 10 * 1024 * 1024 || file.size === 0) throw new ValidationError("Envie um arquivo .xlsx de até 10 MB.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const existing = await prisma.importJob.findUnique({ where: { userId_fileHash_dryRun: { userId, fileHash, dryRun } }, select: publicJob });
  if (existing) return existing;
  const parsed = parseSpreadsheet(buffer);
  if (parsed.totalRows > 5000) throw new ValidationError("Cada lote aceita até 5.000 linhas.");
  if (!parsed.rows.length) throw new ValidationError(parsed.errors[0]?.message ?? "Planilha sem linhas válidas.");
  if (parsed.errors.length && !dryRun) throw new ValidationError("A planilha contém erros. Valide e corrija as linhas antes de importar.");
  const grouped = new Map<string, ParsedRow[]>();
  for (const row of parsed.rows) { const key = invoiceKey(row); grouped.set(key, [...(grouped.get(key) ?? []), row]); }
  if ([...grouped.values()].some((rows) => rows.length > 200)) throw new ValidationError("Uma nota pode ter até 200 linhas por lote.");
  return prisma.importJob.upsert({ where: { userId_fileHash_dryRun: { userId, fileHash, dryRun } }, update: {}, create: {
    userId, fileName: file.name.slice(0,200), fileHash, dryRun, total: parsed.rows.length,
    rows: JSON.parse(JSON.stringify([...grouped.values()].flat())), summary: emptySummary as unknown as Prisma.InputJsonValue,
    parseErrors: parsed.errors.map(({line,message}) => ({line,message})),
  }, select: publicJob });
}
export async function listImportJobs(userId: string) { return prisma.importJob.findMany({ where: { userId }, select: publicJob, orderBy: { createdAt: "desc" }, take: 20 }); }
export async function getImportJob(id: string, userId: string) {
  const job = await prisma.importJob.findFirst({ where: { id, userId }, select: publicJob });
  if(!job) throw new NotFoundError("Importação"); return job;
}
/** Uma nota por transação. Avanço e efeitos são confirmados juntos; reenvio não repete estoque. */
export async function advanceImportJob(id: string, userId: string, retry = false) {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM import_jobs WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`;
      const job = await tx.importJob.findFirst({ where: { id, userId } });
      if(!job) throw new NotFoundError("Importação");
      if(job.status === "COMPLETED" || (job.status === "FAILED" && !retry)) return tx.importJob.findUniqueOrThrow({ where: { id }, select: publicJob });
      const rows = (job.rows as unknown as ParsedRow[]).map((r) => ({...r, invoiceDate: new Date(r.invoiceDate)}));
      const pending = rows.slice(job.processed);
      const key = invoiceKey(pending[0]);
      const batch = pending.filter((row) => invoiceKey(row) === key);
      if(!job.dryRun) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`invoice:${key}`},0))`;
        const existing = await tx.invoice.findUnique({ where: { number_supplierName: { number: batch[0].invoiceNumber, supplierName: batch[0].supplierName } }, include: { _count: { select: { items: true } } } });
        if(existing && existing._count.items > 0) throw new ConflictError(`A nota ${batch[0].invoiceNumber} já possui itens importados. Nenhum estoque deste grupo foi alterado.`);
      }
      const next = await executeImport(batch, job.dryRun, tx, true);
      const summary = job.summary as unknown as ImportSummary;
      for (const field of Object.keys(emptySummary) as Array<keyof ImportSummary>) { if(field !== "errors") summary[field] += next[field]; }
      summary.errors.push(...next.errors);
      const processed = job.processed + batch.length;
      await createAuditLogTx(tx, { session: { sub: userId } }, job.dryRun ? "VALIDATE" : "IMPORT", "ImportJob", id, { invoice: batch[0].invoiceNumber, rows: batch.length });
      return tx.importJob.update({ where: { id }, data: { processed, status: processed >= job.total ? "COMPLETED" : "RUNNING", error: null, summary: summary as unknown as Prisma.InputJsonValue }, select: publicJob });
    }, { timeout: 60_000, maxWait: 10_000 });
  } catch(error) {
    if(error instanceof NotFoundError) throw error;
    console.error(JSON.stringify({ scope: "import-job", jobId: id, message: error instanceof Error ? error.message : "Unknown error" }));
    const message = error instanceof ValidationError || error instanceof ConflictError ? error.message : "Não foi possível processar esta nota. Confira os cadastros e retome a importação.";
    await prisma.importJob.updateMany({ where: { id, userId, status: { not: "COMPLETED" } }, data: { status: "FAILED", error: message.slice(0,500) } });
    return getImportJob(id, userId);
  }
}
export async function advancePendingImports() {
  const jobs = await prisma.importJob.findMany({ where: { status: { in: ["PENDING", "RUNNING"] } }, select: { id: true, userId: true }, take: 3, orderBy: { createdAt: "asc" } });
  const deadline = Date.now() + 45000;
  let batches = 0;
  for (let index = 0; jobs.length && Date.now() < deadline;) {
    const job = jobs[index];
    const result = await advanceImportJob(job.id,job.userId);
    batches++;
    if (result.status === "FAILED" || result.status === "COMPLETED") jobs.splice(index,1);
    else index++;
    if (index >= jobs.length) index = 0;
  }
  return batches;
}
