"use client";

// PipelineKanban — drag-to-progress stage columns.
// Used by Engineer Sourcing pipeline (§4.5) and Jobs Funnel view (§4.7).
//
// API:
//   <PipelineKanban
//     items={[{ id, stage, ...rest }]}
//     stages={[{ key, label, color, hint? }]}
//     onMove={(itemId, newStage) => ...}
//     renderCard={(item) => <YourCard />}
//     onCardClick={(item) => ...}    // optional — click anywhere on card
//   />
//
// Drag is HTML5 native — no library.

import { useState } from "react";

export default function PipelineKanban({ items, stages, onMove, renderCard, onCardClick }) {
  const [draggingId, setDraggingId] = useState(null);
  const [overStage, setOverStage] = useState(null);

  const byStage = stages.reduce((acc, s) => {
    acc[s.key] = items.filter((it) => it.stage === s.key);
    return acc;
  }, {});

  const handleDragStart = (e, id) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };
  const handleDragOver = (e, stageKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overStage !== stageKey) setOverStage(stageKey);
  };
  const handleDrop = (e, stageKey) => {
    e.preventDefault();
    const id = draggingId || e.dataTransfer.getData("text/plain");
    setDraggingId(null);
    setOverStage(null);
    if (!id) return;
    const item = items.find((it) => it.id === id);
    if (!item || item.stage === stageKey) return;
    onMove?.(id, stageKey);
  };
  const handleDragEnd = () => { setDraggingId(null); setOverStage(null); };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stages.map((s) => {
        const list = byStage[s.key] || [];
        const isOver = overStage === s.key;
        return (
          <div
            key={s.key}
            className={`flex w-72 shrink-0 flex-col rounded-xl border bg-navy-50 transition-colors dark:bg-white/5 ${
              isOver ? "border-brand-500 ring-2 ring-brand-300" : "border-navy-200 dark:border-white/10"
            }`}
            onDragOver={(e) => handleDragOver(e, s.key)}
            onDrop={(e) => handleDrop(e, s.key)}
          >
            <header className="flex items-center justify-between border-b border-navy-200 px-3 py-2 dark:border-white/10">
              <div className="flex items-center gap-2">
                {s.color && <span className={`h-2 w-2 rounded-full ${s.color}`} />}
                <h4 className="text-xs font-bold uppercase tracking-wider text-navy-700 dark:text-slate-200">{s.label}</h4>
              </div>
              <span className="rounded-full bg-white px-1.5 text-[10px] font-bold text-navy-700 dark:bg-white/10 dark:text-slate-300">{list.length}</span>
            </header>
            <div className="flex flex-col gap-2 p-2 min-h-[120px]">
              {list.length === 0 && (
                <p className="rounded-lg border border-dashed border-navy-200 p-3 text-center text-[11px] text-navy-400 dark:border-white/10">
                  Drag here
                </p>
              )}
              {list.map((it) => (
                <div
                  key={it.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, it.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => onCardClick?.(it)}
                  className={`cursor-grab rounded-lg border border-navy-200 bg-white p-2 shadow-sm transition-shadow active:cursor-grabbing dark:border-white/10 dark:bg-navy-900 ${
                    draggingId === it.id ? "opacity-50" : "hover:shadow-md"
                  } ${onCardClick ? "cursor-pointer" : ""}`}
                >
                  {renderCard ? renderCard(it) : <div className="text-sm font-medium text-navy-800 dark:text-slate-100">{it.title || it.id}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
