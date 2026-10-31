import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eye, Pencil } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "../../store";
import type { Task } from "../../lib/types";
import { useT } from "../../i18n";

/** Hakt die Checkliste "- [ ]" in der angegebenen Zeile (0-basiert) an bzw. ab. */
function toggleCheckboxAt(text: string, line: number) {
  const lines = text.split("\n");
  if (lines[line] === undefined) return text;
  lines[line] = lines[line].replace(/^(\s*(?:[-*+]|\d+\.)\s+)\[( |x|X)\]/, (_, prefix: string, mark: string) => `${prefix}[${mark === " " ? "x" : " "}]`);
  return lines.join("\n");
}

/** Beschreibung in Markdown. In der Vorschau sind Checklisten direkt anklickbar. */
export function Description({ task }: { task: Task }) {
  const t = useT();
  const [text, setText] = useState(task.description);
  const [editing, setEditing] = useState(!task.description);
  const updateTask = useStore((s) => s.updateTask);

  useEffect(() => setText(task.description), [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (value: string) => {
    if (value !== task.description) updateTask(task.id, { description: value });
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="section-title">{t("task.description")}</h3>
        <button
          className="btn-ghost px-2 py-0.5 text-xs"
          onClick={() => {
            if (editing) save(text);
            setEditing(!editing);
          }}
        >
          {editing ? <Eye size={12} /> : <Pencil size={12} />}
          {editing ? t("task.preview") : t("common.edit")}
        </button>
      </div>
      {editing ? (
        <textarea
          autoFocus={!!task.description}
          className="input min-h-48 resize-y font-mono text-[13px] leading-relaxed"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => save(text)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") (e.target as HTMLElement).blur();
          }}
        />
      ) : (
        <div
          className="selectable prose prose-sm prose-neutral min-h-20 max-w-none cursor-text rounded-md border border-transparent p-3 hover:border-border dark:prose-invert  [&_li:has(input)]:list-none [&_ul:has(input)]:pl-1"
          onDoubleClick={() => setEditing(true)}
        >
          {text ? (
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Die Zeilennummer des Listenpunkts bestimmt, welches "[ ]" umgeschaltet wird
                li: ({ node, children, ...props }) => {
                  const line = node?.position?.start.line;
                  return (
                    <li
                      {...props}
                      onClick={(e) => {
                        if (line === undefined || (e.target as HTMLElement).tagName !== "INPUT") return;
                        e.stopPropagation(); // verschachtelte Listen: nur den innersten Punkt umschalten
                        const next = toggleCheckboxAt(text, line - 1);
                        setText(next);
                        save(next);
                      }}
                    >
                      {children}
                    </li>
                  );
                },
                input: ({ node: _node, ...props }) =>
                  props.type === "checkbox" ? (
                    <input type="checkbox" checked={!!props.checked} onChange={() => {}} className="mr-2 cursor-pointer align-middle" />
                  ) : (
                    <input {...props} />
                  ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    onClick={(e) => {
                      e.preventDefault();
                      if (href) openUrl(href);
                    }}
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {text}
            </Markdown>
          ) : (
            <p className="text-muted-foreground/50">&nbsp;</p>
          )}
        </div>
      )}
    </div>
  );
}
