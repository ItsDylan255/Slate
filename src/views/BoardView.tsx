import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ask } from "@tauri-apps/plugin-dialog";
import { Archive, CheckCircle2, Circle, CircleDot, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "../store";
import type { Column, Task } from "../lib/types";
import { TaskCard, TaskCardView } from "../components/task/TaskCard";
import { useTaskClick } from "../components/task/useTaskClick";
import { MenuItem, MenuSeparator, Popover, usePopover } from "../components/ui/Popover";
import { useT } from "../i18n";

type Items = Record<string, string[]>; // Spalten-ID -> Aufgaben-IDs

const COL = "col:";

/**
 * Aufgaben dürfen nur auf Aufgaben oder Spalteninhalte treffen, Spalten nur auf Spalten.
 * Zuerst zählt, worüber der Mauszeiger ist – so landet eine Karte zuverlässig in der Spalte unter der Maus.
 */
const collision: CollisionDetection = (args) => {
  const draggingColumn = String(args.active.id).startsWith(COL);
  const droppableContainers = args.droppableContainers.filter((c) => String(c.id).startsWith(COL) === draggingColumn);
  const hits = pointerWithin({ ...args, droppableContainers });
  if (hits.length > 0) {
    // Über einer Karte lieber die Karte nehmen als den Spalteninhalt (für die genaue Position)
    const card = hits.find((h) => args.droppableContainers.find((c) => c.id === h.id)?.data.current?.type === "task");
    return card ? [card] : hits;
  }
  return closestCorners({ ...args, droppableContainers });
};

export function BoardView({ projectId, tasks }: { projectId: string; tasks: Task[] }) {
  const t = useT();
  const allColumns = useStore((s) => s.data.columns);
  const columns = useMemo(() => allColumns.filter((c) => c.project_id === projectId), [allColumns, projectId]);
  const { saveOrder, reorderColumns, createColumn } = useStore.getState();

  const boardTasks = useMemo(() => tasks.filter((x) => x.column_id && !x.archived), [tasks]);
  const byId = useMemo(() => new Map(boardTasks.map((x) => [x.id, x])), [boardTasks]);

  const group = (): Items => {
    const items: Items = {};
    for (const c of columns) items[c.id] = [];
    for (const x of boardTasks) items[x.column_id!]?.push(x.id);
    return items;
  };

  const [items, setItemsState] = useState<Items>(group);
  const [colOrder, setColOrder] = useState(() => columns.map((c) => c.id));
  const [activeId, setActiveId] = useState<string | null>(null);
  // Immer aktueller Stand für die Drag-Ereignisse (die kommen schneller, als React neu zeichnet)
  const itemsRef = useRef(items);
  const dragging = useRef(false);
  const setItems = (next: Items) => {
    itemsRef.current = next;
    setItemsState(next);
  };

  // Während des Ziehens nicht von außen überschreiben
  useEffect(() => {
    if (!dragging.current) setItems(group());
  }, [columns, boardTasks]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setColOrder(columns.map((c) => c.id)), [columns]);

  const orderedIds = colOrder.flatMap((c) => items[c] ?? []);
  const click = useTaskClick(orderedIds);

  // Erst ab 5px Bewegung ziehen – so bleibt ein normaler Klick ein Klick
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  /** Spalte, in der eine Aufgabe (oder Spalte) gerade liegt – immer im übergebenen Stand gesucht. */
  const findColumn = (state: Items, id: string): string | undefined => {
    if (id.startsWith(COL)) return id.slice(COL.length);
    if (state[id]) return id;
    return Object.keys(state).find((c) => state[c].includes(id));
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    dragging.current = true;
    setActiveId(String(active.id));
  };

  // Beim Ziehen über eine andere Spalte die Karte dorthin verschieben (genau einmal, nie doppelt)
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || String(active.id).startsWith(COL)) return;
    const aid = String(active.id);
    const prev = itemsRef.current;
    const from = findColumn(prev, aid);
    const to = findColumn(prev, String(over.id));
    if (!from || !to || from === to) return;
    const next: Items = {};
    for (const c of Object.keys(prev)) next[c] = prev[c].filter((x) => x !== aid);
    const overIdx = next[to].indexOf(String(over.id));
    next[to].splice(overIdx >= 0 ? overIdx : next[to].length, 0, aid);
    setItems(next);
  };

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    dragging.current = false;
    if (!over) {
      setItems(group());
      return;
    }
    const aid = String(active.id);
    const oid = String(over.id);

    // Spalte verschoben
    if (aid.startsWith(COL)) {
      const a = colOrder.indexOf(aid.slice(COL.length));
      const b = colOrder.indexOf(findColumn(itemsRef.current, oid) ?? "");
      if (a >= 0 && b >= 0 && a !== b) {
        const next = arrayMove(colOrder, a, b);
        setColOrder(next);
        await reorderColumns(next);
      }
      return;
    }

    // Aufgabe verschoben
    const current = itemsRef.current;
    const col = findColumn(current, aid);
    if (!col) return;
    let next = current;
    const list = current[col];
    const oldIdx = list.indexOf(aid);
    const newIdx = list.indexOf(oid);
    if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
      next = { ...current, [col]: arrayMove(list, oldIdx, newIdx) };
      setItems(next);
    }
    await saveOrder(colOrder.flatMap((c) => (next[c] ?? []).map((id) => ({ id, column_id: c }))));
  };

  const activeTask = activeId ? byId.get(activeId) : undefined;
  const activeColumn = activeId?.startsWith(COL) ? columns.find((c) => COL + c.id === activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        dragging.current = false;
        setItems(group());
      }}
    >
      <div className="flex h-full gap-3 overflow-x-auto p-3">
        <SortableContext items={colOrder.map((c) => COL + c)} strategy={horizontalListSortingStrategy}>
          {colOrder.map((cid) => {
            const c = columns.find((x) => x.id === cid);
            if (!c) return null;
            return (
              <BoardColumn
                key={c.id}
                column={c}
                first={c.id === colOrder.find((id) => !columns.find((x) => x.id === id)?.is_done)}
                taskIds={items[c.id] ?? []}
                byId={byId}
                onTaskClick={click.onClick}
                onTaskMenu={click.onContextMenu}
              />
            );
          })}
        </SortableContext>
        <AddColumn onAdd={(name) => createColumn(projectId, name)} placeholder={t("board.columnName")} label={t("board.addColumn")} />
      </div>
      <DragOverlay>
        {activeTask && <TaskCardView task={activeTask} floating />}
        {activeColumn && (
          <div className="w-72 rounded-xl bg-accent p-3 text-sm font-semibold opacity-90 shadow-lg ">
            {activeColumn.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({
  column,
  first,
  taskIds,
  byId,
  onTaskClick,
  onTaskMenu,
}: {
  column: Column;
  first: boolean;
  taskIds: string[];
  byId: Map<string, Task>;
  onTaskClick: (e: React.MouseEvent, id: string) => void;
  onTaskMenu: (e: React.MouseEvent, id: string) => void;
}) {
  const t = useT();
  const { patch, deleteColumn, archiveDone, set } = useStore.getState();
  const { setNodeRef: dropRef } = useDroppable({ id: column.id, data: { type: "column-body" } });
  const sortable = useSortable({ id: COL + column.id, data: { type: "column" } });
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);
  const menu = usePopover();

  const saveName = async () => {
    setRenaming(false);
    if (name.trim() && name.trim() !== column.name) await patch("columns", column.id, { name: name.trim() });
    else setName(column.name);
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
      className={`group/col relative flex h-full min-h-0 w-80 max-w-96 min-w-80 flex-1 shrink-0 flex-col rounded-xl bg-board-lane transition-colors duration-150 ${
        sortable.isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 pt-1 pr-2 pl-3 mt-1" {...sortable.attributes} {...sortable.listeners}>
        <span className="text-chip-icon">
          {column.is_done ? <CheckCircle2 className="size-4" /> : first ? <Circle className="size-4" /> : <CircleDot className="size-4" />}
        </span>
        {renaming ? (
          <input
            autoFocus
            className="input h-6 py-0"
            value={name}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setName(column.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <span
            className="min-w-0 cursor-grab truncate text-[13px] leading-5 font-medium text-board-title"
            onDoubleClick={() => setRenaming(true)}
            title={t("board.columnHint")}
          >
            {column.name}
          </span>
        )}
        <span className="text-xs text-board-id tabular-nums">{taskIds.length}</span>
        <div className="ml-auto flex items-center">
          {column.is_done && taskIds.length > 0 ? (
            <button className="btn-icon size-6" title={t("board.archiveAll")} onPointerDown={(e) => e.stopPropagation()} onClick={() => archiveDone(column.id)}>
              <Archive className="size-3.5" />
            </button>
          ) : null}
          <button className="btn-icon size-6" title={t("board.addTask")} onPointerDown={(e) => e.stopPropagation()} onClick={() => set({ newTaskFor: { projectId: column.project_id, columnId: column.id } })}>
            <Plus className="size-3.5" />
          </button>
          <button className="btn-icon size-6" onPointerDown={(e) => e.stopPropagation()} onClick={menu.open}>
            <MoreHorizontal className="size-3.5" />
          </button>
        </div>
      </div>

      {menu.anchor && (
        <Popover anchor={menu.anchor} onClose={menu.close}>
          <MenuItem icon={<Plus size={14} />} onClick={() => (menu.close(), set({ newTaskFor: { projectId: column.project_id, columnId: column.id } }))}>
            {t("board.addTask")}
          </MenuItem>
          <MenuItem icon={<Pencil size={14} />} onClick={() => (menu.close(), setRenaming(true))}>
            {t("common.rename")}
          </MenuItem>
          <MenuItem
            icon={<CheckCircle2 size={14} />}
            active={!!column.is_done}
            onClick={() => (menu.close(), patch("columns", column.id, { is_done: column.is_done ? 0 : 1 }))}
          >
            {t("board.doneColumn")}
          </MenuItem>
          {taskIds.length > 0 && (
            <MenuItem icon={<Archive size={14} />} onClick={() => (menu.close(), archiveDone(column.id))}>
              {t("board.archiveAll")}
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem
            danger
            icon={<Trash2 size={14} />}
            onClick={async () => {
              menu.close();
              if (taskIds.length === 0 || (await ask(t("board.confirmDeleteColumn", { n: taskIds.length }), { kind: "warning" }))) {
                set({ selection: [] });
                await deleteColumn(column.id);
              }
            }}
          >
            {t("board.deleteColumn")}
          </MenuItem>
        </Popover>
      )}

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div ref={dropRef} className="flex min-h-12 flex-1 flex-col gap-1.5 overflow-x-hidden overflow-y-auto p-1.5">
          {taskIds.map((id) => {
            const task = byId.get(id);
            return task ? (
              <TaskCard
                key={id}
                task={task}
                done={!!column.is_done}
                onClick={(e) => onTaskClick(e, id)}
                onContextMenu={(e) => onTaskMenu(e, id)}
              />
            ) : null;
          })}
          <button
              className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted-foreground opacity-0 transition-opacity group-hover/col:opacity-100 hover:bg-chip-hover hover:text-foreground"
              onClick={() => set({ newTaskFor: { projectId: column.project_id, columnId: column.id } })}
            >
              <Plus className="size-3.5" /> {t("board.addTask")}
            </button>
        </div>
      </SortableContext>
    </div>
  );
}

export function AddColumn({ onAdd, placeholder, label }: { onAdd: (name: string) => void; placeholder: string; label: string }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const save = () => {
    if (name.trim()) onAdd(name.trim());
    setName("");
    setAdding(false);
  };

  return (
    <div className="w-80 shrink-0 pt-1">
      {adding ? (
        <input
          autoFocus
          className="input"
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") save();
            if (e.key === "Escape") setAdding(false);
          }}
        />
      ) : (
        <button
          className="flex h-9 w-full cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-border px-3 text-[13px] text-muted-foreground hover:bg-board-lane hover:text-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus size={14} /> {label}
        </button>
      )}
    </div>
  );
}
