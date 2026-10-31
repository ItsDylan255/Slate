// Speicherort der Anhänge: %APPDATA%\com.dylan.projektmanager\attachments
import { joinPath, native } from "./native";
import { newId } from "./db";

let dirPromise: Promise<string> | null = null;

export function attachmentsDir() {
  dirPromise ??= native.appDataPath().then((p) => joinPath(p, "attachments"));
  return dirPromise;
}

export async function attachmentPath(file: string) {
  return joinPath(await attachmentsDir(), file);
}

/** Kopiert eine Datei in den Anhänge-Ordner und gibt die Daten für die Datenbank zurück. */
export async function importAttachment(srcPath: string) {
  const name = srcPath.split(/[\\/]/).pop() ?? "datei";
  const file = `${newId()}-${name.replace(/[^\w.\- ]+/g, "_")}`;
  const size = await native.copyFile(srcPath, await attachmentPath(file));
  return { name, file, size };
}

export const isImage = (name: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

export async function imageDataUrl(file: string) {
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const b64 = await native.readFileBase64(await attachmentPath(file));
  return `data:${MIME[ext] ?? "application/octet-stream"};base64,${b64}`;
}
