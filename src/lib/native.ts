// Aufrufe der Rust-Befehle aus src-tauri/src/lib.rs
import { invoke } from "@tauri-apps/api/core";

export const native = {
  findGoogleDrive: () => invoke<string | null>("find_google_drive"),
  appDataPath: () => invoke<string>("app_data_path"),
  readTextFile: (path: string) => invoke<string>("read_text_file", { path }),
  writeTextFile: (path: string, content: string) => invoke<void>("write_text_file", { path, content }),
  readJsonFiles: (dir: string) => invoke<[string, string][]>("read_json_files", { dir }),
  listFiles: (dir: string) => invoke<string[]>("list_files", { dir }),
  copyFile: (src: string, dst: string) => invoke<number>("copy_file", { src, dst }),
  deleteFile: (path: string) => invoke<void>("delete_file", { path }),
  fileExists: (path: string) => invoke<boolean>("file_exists", { path }),
  readFileBase64: (path: string) => invoke<string>("read_file_base64", { path }),
  openPath: (path: string) => invoke<void>("open_path", { path }),
  revealPath: (path: string) => invoke<void>("reveal_path", { path }),
  quarantineDatabase: () => invoke<string>("quarantine_database"),
  oauthLoopback: (authUrl: string) => invoke<[string, string]>("oauth_loopback", { authUrl }),
  httpRequest: (method: string, url: string, headers: [string, string][], body?: string) =>
    invoke<[number, string]>("http_request", { method, url, headers, body: body ?? null }),
};

export const joinPath = (...parts: string[]) =>
  parts.map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, ""))).join("\\");
