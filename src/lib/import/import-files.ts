export type ImportFormat = "xlsx" | "xml" | "pdf" | "photo";
export const IMPORT_ACCEPT = ".xlsx,.xml,.pdf,.jpg,.jpeg,.png,.webp";
const photos = new Set(["jpg", "jpeg", "png", "webp"]);
type FileInfo = Pick<File, "name" | "size">;
/** Identifica o fluxo antes de ler bytes ou enviar arquivos. A assinatura é validada pelo leitor. */
export function detectImportFormat(files: readonly FileInfo[]): ImportFormat {
  if (!files.length) throw new Error("Selecione uma planilha, XML, PDF ou fotos da nota.");
  if (files.length > 10) throw new Error("Selecione até 10 fotos da mesma nota.");
  if (files.some(file => file.size === 0)) throw new Error("Um dos arquivos está vazio.");
  if (files.some(file => file.size > 10 * 1024 * 1024)) throw new Error("Cada arquivo pode ter até 10 MB.");
  if (files.reduce((total, file) => total + file.size, 0) > 25 * 1024 * 1024) throw new Error("Os arquivos juntos podem ter até 25 MB.");
  const formats = files.map(file => {
    const extension = file.name.toLowerCase().split(".").at(-1) ?? "";
    if (photos.has(extension)) return "photo" as const;
    if (extension === "xlsx" || extension === "xml" || extension === "pdf") return extension;
    throw new Error("Formato não aceito. Use XLSX, XML, PDF ou fotos JPG, PNG e WebP.");
  });
  if (formats.length > 1 && !formats.every(format => format === "photo")) {
    throw new Error("Envie uma planilha, XML ou PDF por vez. Para fotos, selecione as páginas da mesma nota juntas.");
  }
  if (formats[0] === "xlsx" && files[0].size > 4 * 1024 * 1024) throw new Error("A planilha XLSX pode ter até 4 MB. Divida arquivos maiores em lotes.");
  return formats[0];
}
