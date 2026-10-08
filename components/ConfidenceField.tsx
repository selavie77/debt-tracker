"use client";

import { useState } from "react";

const PRESETS = [
  { label: "Low", value: 40 },
  { label: "Medium", value: 60 },
  { label: "High", value: 80 },
  { label: "Certain", value: 100 },
];

/** Confidence from 1 to 100, with one-click presets. The plan counts the amount times this. */
export function ConfidenceField({ idPrefix, defaultValue = 60, hint }: { idPrefix: string; defaultValue?: number; hint: string }) {
  const [value, setValue] = useState(String(defaultValue));
  return (
    <label className="wide">How confident are you? (1 to 100)
      <div className="actions">
        <input type="text" id={`${idPrefix}-confidence`} name="confidence" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} style={{ maxWidth: 110 }} required />
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className={`pick`} aria-pressed={value === String(p.value)} onClick={() => setValue(String(p.value))}>
            {p.label} ({p.value})
          </button>
        ))}
      </div>
      <span className="note">{hint}</span>
    </label>
  );
}
