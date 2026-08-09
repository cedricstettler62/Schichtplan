import { useState } from "react";

export default function CollapsibleBar({ title, count, tone, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sb-bar">
      <button type="button" className={`sb-bar-head sb-bar-${tone}`} onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span className="sb-bar-count">{count}</span>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="sb-bar-body">{count === 0 ? <p className="sb-empty">Nichts zu sehen.</p> : children}</div>}
    </div>
  );
}
