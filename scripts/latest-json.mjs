// Erstellt latest.json für den Updater aus dem fertigen Build.
// Aufruf nach `npm run tauri build`:  node scripts/latest-json.mjs "Release-Notizen"
// Die Datei landet in src-tauri/target/release/bundle/latest.json und wird mit ins GitHub-Release geladen.
import fs from "node:fs";
import path from "node:path";

const conf = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
const version = conf.version;
const setup = `${conf.productName}_${version}_x64-setup.exe`;
const bundle = "src-tauri/target/release/bundle";
const sigFile = path.join(bundle, "nsis", `${setup}.sig`);
if (!fs.existsSync(sigFile)) {
  console.error(`Signatur fehlt: ${sigFile}\nBuild mit TAURI_SIGNING_PRIVATE_KEY bauen.`);
  process.exit(1);
}

const latest = {
  version,
  notes: process.argv[2] ?? "",
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: fs.readFileSync(sigFile, "utf8").trim(),
      url: `https://github.com/ItsDylan255/Slate/releases/download/v${version}/${setup}`,
    },
  },
};
fs.writeFileSync(path.join(bundle, "latest.json"), JSON.stringify(latest, null, 2));
console.log(`latest.json für ${version} erstellt`);
