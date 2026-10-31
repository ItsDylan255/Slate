// Übersetzungen. Deutsch (de.ts) ist die Quelle – jeder Text muss auch in en.ts stehen.
import { useCallback } from "react";
import { useStore } from "../store";
import { de } from "./de";
import { en } from "./en";

export type Lang = "de" | "en";
export type TKey = keyof typeof de;
export type TFunc = (key: TKey, vars?: Record<string, string | number>) => string;

const dicts: Record<Lang, Record<TKey, string>> = { de, en };

export function translate(lang: Lang, key: TKey, vars?: Record<string, string | number>) {
  let s = dicts[lang][key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function useT(): TFunc {
  const lang = useStore((s) => s.lang);
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}
