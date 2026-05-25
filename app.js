/* ==========================================================================
 * Ramiz Tracker — Personal Gym & Nutrition Dashboard
 * Single-file React app. No build step. Data stored in localStorage.
 * ========================================================================== */

const { useState, useEffect, useMemo, useRef, useCallback } = React;

/* ==========================================================================
 * 1. STORAGE
 * ========================================================================== */

const STORAGE_KEY = "ramiz_tracker_v1";

const DEFAULT_STATE = {
  days: {},        // { "2026-05-25": { calories, macros, sleep, ... } }
  workouts: {},    // { "2026-05-25": [{ exercise, muscle, sets:[{w,r,rpe}], duration }] }
  photos: {},      // { "2026-05-25": "data:image/jpeg;base64,..." }
  goals: {
    calorieTarget: 2800,
    proteinTarget: 180,
    carbsTarget: 320,
    fatsTarget: 80,
    workoutsPerWeek: 4,
    sleepTarget: 8,
    waterTarget: 3.0,
  },
  meta: {
    startDate: null,     // first day logged
    startWeight: null,
  },
  // Training plan: rotates through `cycle` starting from `startDate`.
  plan: {
    startDate: "2026-05-27",        // Wed 27 May 2026 = Upper
    cycle: ["upper", "lower", "rest"],
    routines: {
      upper: {
        name: "Upper",
        exercises: [
          { exercise: "Pull Up",                muscle: "Back" },
          { exercise: "Seated Row (Machine)",   muscle: "Back" },
          { exercise: "Overhead Press (Barbell)", muscle: "Shoulders" },
          { exercise: "Unilateral Tricep",      muscle: "Triceps" },
          { exercise: "Triceps Pushdown",       muscle: "Triceps" },
          { exercise: "Reverse Forearm Curl",   muscle: "Forearms" },
          { exercise: "Arm Wrestle Curl",       muscle: "Biceps" },
          { exercise: "Preacher Curl (Machine)", muscle: "Biceps" },
          { exercise: "Chest Press (Plates)",   muscle: "Chest" },
          { exercise: "Leg Raise Parallel Bars", muscle: "Core" },
        ],
      },
      lower: {
        name: "Lower",
        exercises: [], // fill in via Plan tab
      },
      rest: {
        name: "Rest",
        exercises: [],
      },
    },
  },
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    // shallow merge to handle schema additions
    const merged = {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      goals: { ...DEFAULT_STATE.goals, ...(parsed.goals || {}) },
      meta: { ...DEFAULT_STATE.meta, ...(parsed.meta || {}) },
    };
    // Plan needs deeper merge so missing routines fall back to defaults.
    const planSaved = parsed.plan || {};
    merged.plan = {
      ...DEFAULT_STATE.plan,
      ...planSaved,
      routines: {
        ...DEFAULT_STATE.plan.routines,
        ...(planSaved.routines || {}),
      },
    };
    return merged;
  } catch (e) {
    console.warn("Failed to load state, resetting", e);
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Save failed (storage full?)", e);
  }
}

/* ==========================================================================
 * 2. DATE UTILITIES
 * ========================================================================== */

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function daysBetween(a, b) {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  const dA = new Date(ya, ma - 1, da);
  const dB = new Date(yb, mb - 1, db);
  return Math.round((dB - dA) / 86400000);
}

function formatDate(iso, opts = {}) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const today = todayISO();
  if (opts.relative) {
    if (iso === today) return "Today";
    if (iso === addDays(today, -1)) return "Yesterday";
  }
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: opts.year ? "numeric" : undefined });
}

function lastNDays(n, endIso = todayISO()) {
  return Array.from({ length: n }, (_, i) => addDays(endIso, -(n - 1 - i)));
}

function isoMonthStart(iso) {
  const [y, m] = iso.split("-");
  return `${y}-${m}-01`;
}

function monthOf(iso) {
  const [y, m] = iso.split("-");
  return `${y}-${m}`;
}

/**
 * Given a plan { startDate, cycle: [..] } returns the cycle key for `iso`,
 * or null if iso is before the start date or the plan is unconfigured.
 */
function splitForDate(plan, iso) {
  if (!plan || !plan.startDate || !plan.cycle || plan.cycle.length === 0) return null;
  const delta = daysBetween(plan.startDate, iso);
  if (delta < 0) return null;
  const len = plan.cycle.length;
  return plan.cycle[((delta % len) + len) % len];
}

function weekdayShort(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
}

/* ==========================================================================
 * 3. NUMERIC UTILITIES
 * ========================================================================== */

function avg(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((s, x) => s + (x || 0), 0) / arr.length;
}

function sum(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((s, x) => s + (x || 0), 0);
}

function round(n, p = 1) {
  const f = Math.pow(10, p);
  return Math.round(n * f) / f;
}

function fmt(n, p = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return round(n, p).toLocaleString();
}

function pct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Math.round(n)}%`;
}

/* ==========================================================================
 * 4. MACRO / VOLUME CALCULATIONS
 * ========================================================================== */

// Default macro split: 25% protein, 45% carbs, 30% fats (good for muscle gain)
function estimateMacros(cals, ratios = { p: 0.25, c: 0.45, f: 0.30 }) {
  if (!cals) return { protein: 0, carbs: 0, fats: 0 };
  return {
    protein: Math.round((cals * ratios.p) / 4),
    carbs: Math.round((cals * ratios.c) / 4),
    fats: Math.round((cals * ratios.f) / 9),
  };
}

function caloriesFromMacros(p, c, f) {
  return (p || 0) * 4 + (c || 0) * 4 + (f || 0) * 9;
}

// Muscle group inference from exercise name
const MUSCLE_KEYWORDS = [
  { kw: ["bench", "chest fly", "pec deck", "push up", "push-up", "dip", "incline press", "decline press"], group: "Chest" },
  { kw: ["squat", "leg press", "lunge", "leg extension", "step up", "split squat", "bulgarian", "hack squat"], group: "Quads" },
  { kw: ["rdl", "romanian", "leg curl", "hamstring", "good morning", "stiff leg"], group: "Hamstrings" },
  { kw: ["deadlift", "row", "pull up", "pull-up", "pulldown", "lat", "chin up", "chin-up", "shrug", "rack pull", "pendlay"], group: "Back" },
  { kw: ["overhead press", "ohp", "shoulder press", "military", "arnold", "lateral raise", "front raise", "upright row"], group: "Shoulders" },
  { kw: ["face pull", "rear delt", "reverse fly"], group: "Rear Delts" },
  { kw: ["curl", "bicep", "preacher", "hammer", "concentration"], group: "Biceps" },
  { kw: ["tricep", "skullcrusher", "pushdown", "kickback", "close grip"], group: "Triceps" },
  { kw: ["calf", "calves"], group: "Calves" },
  { kw: ["glute", "hip thrust", "hip bridge"], group: "Glutes" },
  { kw: ["ab", "crunch", "plank", "leg raise", "sit up", "sit-up", "russian twist", "hanging knee"], group: "Core" },
  { kw: ["forearm", "wrist curl"], group: "Forearms" },
];

function inferMuscle(name) {
  const lower = (name || "").toLowerCase();
  for (const { kw, group } of MUSCLE_KEYWORDS) {
    if (kw.some((k) => lower.includes(k))) return group;
  }
  return "Other";
}

function volumeOfWorkout(workout) {
  // returns { totalVolume, byMuscle: { Chest: 3200, ... }, avgRPE, setCount }
  const byMuscle = {};
  let total = 0;
  let rpeSum = 0;
  let rpeCount = 0;
  let setCount = 0;
  (workout || []).forEach((ex) => {
    const muscle = ex.muscle || inferMuscle(ex.exercise);
    (ex.sets || []).forEach((s) => {
      const v = (s.weight || 0) * (s.reps || 0);
      total += v;
      byMuscle[muscle] = (byMuscle[muscle] || 0) + v;
      setCount += 1;
      if (s.rpe) { rpeSum += s.rpe; rpeCount += 1; }
    });
  });
  return {
    totalVolume: total,
    byMuscle,
    avgRPE: rpeCount ? rpeSum / rpeCount : 0,
    setCount,
  };
}

/* ==========================================================================
 * 5. HEVY TEXT PARSER
 * Handles Hevy "Share Workout" text format.
 * Lines look like:
 *   Push Day
 *   Friday, 21 May 2026
 *
 *   Bench Press (Barbell)
 *   Set 1: 80 kg × 8
 *   Set 2: 80 kg × 7 @ 8
 *   Warmup: 40 kg × 10
 *
 *   Incline Dumbbell Press
 *   1: 30kg x 10
 *   2: 30kg x 10
 * ========================================================================== */

function parseHevyText(text) {
  if (!text || !text.trim()) return { exercises: [], warnings: ["Empty text."] };
  const lines = text.split(/\r?\n/);
  const exercises = [];
  let current = null;
  const warnings = [];

  // Matches: "Set 1: 80 kg × 8 @ 8" or "1: 80kg x 8" or "Warmup: 40kg x 10"
  const setRe = /^(?:set\s*\d+|warmup|warm-up|\d+)\s*[:\.\-)]\s*([\d.]+)\s*(kg|lb|lbs)?\s*[x×]\s*([\d]+)(?:\s*@\s*([\d.]+))?/i;
  // Header line is text that doesn't match set pattern and isn't a known meta line
  const skipRe = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d+\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|duration|volume|sets|prs|notes)/i;

  const flush = () => {
    if (current && current.sets.length > 0) exercises.push(current);
  };

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const setMatch = line.match(setRe);
    if (setMatch) {
      const weight = parseFloat(setMatch[1]);
      const unit = (setMatch[2] || "kg").toLowerCase();
      const reps = parseInt(setMatch[3], 10);
      const rpe = setMatch[4] ? parseFloat(setMatch[4]) : null;
      const w = unit.startsWith("lb") ? round(weight * 0.453592, 1) : weight;
      if (!current) {
        warnings.push(`Set found before exercise name: "${line}"`);
        continue;
      }
      current.sets.push({ weight: w, reps, rpe });
    } else if (skipRe.test(line) && !current) {
      // header/meta — skip
      continue;
    } else {
      // treat as exercise header
      flush();
      const name = line.replace(/\s*\([^)]*\)\s*$/, "").trim();
      const variant = (line.match(/\(([^)]+)\)/) || [])[1] || "";
      current = {
        exercise: name,
        variant,
        muscle: inferMuscle(name),
        sets: [],
      };
    }
  }
  flush();

  if (exercises.length === 0) {
    warnings.push("No exercises parsed. Use format: 'Exercise Name' on its own line, followed by 'Set 1: 80kg × 8' lines.");
  }
  return { exercises, warnings };
}

/* ==========================================================================
 * 6. CUSTOM HOOKS
 * ========================================================================== */

function useStore() {
  const [state, setState] = useState(loadState);
  const saveTimer = useRef(null);

  // debounced save
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveState(state), 200);
    return () => saveTimer.current && clearTimeout(saveTimer.current);
  }, [state]);

  const setDay = useCallback((date, patch) => {
    setState((s) => {
      const cur = s.days[date] || {};
      const next = { ...cur, ...patch, date };
      // bookkeeping: track meta start
      const meta = { ...s.meta };
      if (!meta.startDate || date < meta.startDate) meta.startDate = date;
      if (next.weight && !meta.startWeight) meta.startWeight = next.weight;
      return { ...s, days: { ...s.days, [date]: next }, meta };
    });
  }, []);

  const setWorkout = useCallback((date, workout) => {
    setState((s) => ({ ...s, workouts: { ...s.workouts, [date]: workout } }));
  }, []);

  const setPhoto = useCallback((date, dataUrl) => {
    setState((s) => ({ ...s, photos: { ...s.photos, [date]: dataUrl } }));
  }, []);

  const removePhoto = useCallback((date) => {
    setState((s) => {
      const next = { ...s.photos };
      delete next[date];
      return { ...s, photos: next };
    });
  }, []);

  const setGoals = useCallback((patch) => {
    setState((s) => ({ ...s, goals: { ...s.goals, ...patch } }));
  }, []);

  const setPlan = useCallback((patch) => {
    setState((s) => ({ ...s, plan: { ...s.plan, ...patch } }));
  }, []);

  const setRoutine = useCallback((key, patch) => {
    setState((s) => ({
      ...s,
      plan: {
        ...s.plan,
        routines: {
          ...s.plan.routines,
          [key]: { ...(s.plan.routines[key] || { name: key, exercises: [] }), ...patch },
        },
      },
    }));
  }, []);

  const resetAll = useCallback(() => {
    if (confirm("Wipe ALL tracking data? This can't be undone.")) {
      localStorage.removeItem(STORAGE_KEY);
      setState(structuredClone(DEFAULT_STATE));
    }
  }, []);

  const exportData = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ramiz-tracker-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const importData = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.days || !data.goals) throw new Error("Invalid backup");
        if (confirm("Replace current data with backup?")) setState(data);
      } catch (err) {
        alert("Bad file: " + err.message);
      }
    };
    reader.readAsText(file);
  }, []);

  return { state, setDay, setWorkout, setPhoto, removePhoto, setGoals, setPlan, setRoutine, resetAll, exportData, importData };
}

function useToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  const show = useCallback((m) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 1800);
  }, []);
  const node = msg ? <div className="toast">{msg}</div> : null;
  return [show, node];
}

/* ==========================================================================
 * 7. COMMON COMPONENTS
 * ========================================================================== */

/* Custom line icons — no emoji. All draw on a 24×24 grid. */
const ICONS = {
  dumbbell: (
    <g>
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="6" y1="9" x2="6" y2="15" />
      <line x1="18" y1="9" x2="18" y2="15" />
      <line x1="4" y1="10.5" x2="4" y2="13.5" />
      <line x1="20" y1="10.5" x2="20" y2="13.5" />
    </g>
  ),
  camera: (
    <g>
      <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </g>
  ),
  bars: (
    <g>
      <line x1="3" y1="20" x2="21" y2="20" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="11" y1="20" x2="11" y2="9" />
      <line x1="16" y1="20" x2="16" y2="15" />
      <line x1="20" y1="20" x2="20" y2="6" />
    </g>
  ),
  trend: (
    <g>
      <polyline points="3 17 9 11 14 14 21 6" />
      <polyline points="15 6 21 6 21 12" />
    </g>
  ),
  weight: (
    <g>
      <polyline points="3 17 9 12 14 15 21 8" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14" cy="15" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="21" cy="8" r="1.5" fill="currentColor" stroke="none" />
    </g>
  ),
  award: (
    <g>
      <circle cx="12" cy="9" r="5" />
      <polyline points="9 13 7.5 21 12 18.5 16.5 21 15 13" />
    </g>
  ),
  list: (
    <g>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </g>
  ),
  flame: (
    <g>
      <path d="M12 3c0 4 5 5 5 10a5 5 0 01-10 0c0-3 2-3 2-6 1 1 2 1 2 3 0-2 1-4 1-7z" />
    </g>
  ),
  alert: (
    <g>
      <path d="M10.3 4L2.5 17.5a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 4a2 2 0 00-3.4 0z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <circle cx="12" cy="17.3" r="0.6" fill="currentColor" stroke="none" />
    </g>
  ),
  check: (
    <g>
      <polyline points="4 12 10 18 20 6" />
    </g>
  ),
  dot: (
    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
  ),
};

function Icon({ name, size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

function EmptyState({ icon, children }) {
  return (
    <div className="empty">
      <div className="ic"><Icon name={icon} size={26} /></div>
      <div>{children}</div>
    </div>
  );
}

function Card({ title, hint, subtitle, children }) {
  return (
    <div className="card">
      {title && (
        <h3 className="card-title">
          <span>{title}</span>
          {hint && <span className="hint">{hint}</span>}
        </h3>
      )}
      {subtitle && <div className="card-sub">{subtitle}</div>}
      {children}
    </div>
  );
}

function Slider({ label, value, onChange, min = 1, max = 10, step = 1, unit = "" }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="slider-wrap">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value || min}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <span className="slider-value">{value || min}{unit}</span>
      </div>
    </div>
  );
}

function NumInput({ label, value, onChange, placeholder, suffix, step = "any" }) {
  return (
    <div className="field">
      <label>
        {label}
        {suffix && <span style={{ color: "var(--text-faint)", marginLeft: 4 }}>({suffix})</span>}
      </label>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : parseFloat(v));
        }}
      />
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder, multiline }) {
  return (
    <div className="field">
      <label>{label}</label>
      {multiline ? (
        <textarea value={value || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" value={value || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label className="check">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="box"></span>
      <span>{label}</span>
    </label>
  );
}

function DateNav({ date, onChange, max = todayISO() }) {
  return (
    <div className="date-nav">
      <button onClick={() => onChange(addDays(date, -1))} aria-label="Previous day">‹</button>
      <input type="date" value={date} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <button
        onClick={() => { const next = addDays(date, 1); if (next <= max) onChange(next); }}
        aria-label="Next day"
        disabled={date >= max}
        style={{ opacity: date >= max ? 0.3 : 1 }}
      >›</button>
    </div>
  );
}

function Stat({ label, value, unit, delta, deltaDir }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {delta !== undefined && delta !== null && (
        <div className={`delta ${deltaDir || "flat"}`}>{delta}</div>
      )}
    </div>
  );
}

function ComplianceRing({ value, label, sublabel }) {
  const radius = 48;
  const c = 2 * Math.PI * radius;
  const v = Math.max(0, Math.min(100, value || 0));
  const offset = c - (c * v) / 100;
  const color = v >= 90 ? "var(--good)" : v >= 70 ? "var(--warn)" : "var(--bad)";
  const cls = v >= 90 ? "score-good" : v >= 70 ? "score-warn" : "score-bad";
  return (
    <div style={{ textAlign: "center" }}>
      <div className="ring">
        <svg width="110" height="110">
          <circle cx="55" cy="55" r={radius} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
          <circle
            cx="55" cy="55" r={radius}
            fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.4s" }}
          />
        </svg>
        <div className={`num ${cls}`}>
          {Math.round(v)}<span style={{ fontSize: 14 }}>%</span>
          {sublabel && <small>{sublabel}</small>}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>{label}</div>
    </div>
  );
}

/* ==========================================================================
 * 8. CHART COMPONENT (Chart.js wrapper)
 * ========================================================================== */

function LineChart({ labels, datasets, yLabel, yMin, yMax, tall }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) chartRef.current.destroy();
    const ctx = ref.current.getContext("2d");
    chartRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: datasets.map((d) => ({
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: false,
          ...d,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: datasets.length > 1, labels: { color: "#9ca3af", boxWidth: 12, font: { size: 11 } } },
          tooltip: { backgroundColor: "#1c1c1c", borderColor: "#2a2a2a", borderWidth: 1, titleColor: "#e5e5e5", bodyColor: "#e5e5e5" },
        },
        scales: {
          x: {
            ticks: { color: "#6b7280", font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 },
            grid: { color: "#1c1c1c" },
          },
          y: {
            min: yMin,
            max: yMax,
            ticks: { color: "#6b7280", font: { size: 10 } },
            grid: { color: "#1c1c1c" },
            title: yLabel ? { display: true, text: yLabel, color: "#6b7280", font: { size: 10 } } : undefined,
          },
        },
      },
    });
    return () => chartRef.current && chartRef.current.destroy();
  }, [labels, datasets, yLabel, yMin, yMax]);

  return (
    <div className={"chart-wrap " + (tall ? "chart-wrap-tall" : "")}>
      <canvas ref={ref}></canvas>
    </div>
  );
}

function BarChart({ labels, data, color = "#10b981", yLabel }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(ref.current.getContext("2d"), {
      type: "bar",
      data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 4 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1c1c1c" } },
        scales: {
          x: { ticks: { color: "#6b7280", font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: "#6b7280", font: { size: 10 } }, grid: { color: "#1c1c1c" },
               title: yLabel ? { display: true, text: yLabel, color: "#6b7280", font: { size: 10 } } : undefined },
        },
      },
    });
    return () => chartRef.current && chartRef.current.destroy();
  }, [labels, data, color, yLabel]);
  return <div className="chart-wrap"><canvas ref={ref}></canvas></div>;
}

/* ==========================================================================
 * 8b. CALENDAR + PLAN TAB
 * ========================================================================== */

function Calendar({ plan, workouts, monthIso, selectedIso, todayIso, onSelect }) {
  const [y, m] = monthIso.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let firstDow = new Date(y, m - 1, 1).getDay(); // 0=Sun
  firstDow = firstDow === 0 ? 6 : firstDow - 1;  // shift to 0=Mon

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push({ empty: true, key: "e" + i });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ iso, d });
  }

  return (
    <div>
      <div className="cal-grid">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((l) => (
          <div key={l} className="cal-dow">{l}</div>
        ))}
        {cells.map((c) => {
          if (c.empty) return <div key={c.key} className="cal-cell empty" />;
          const split = splitForDate(plan, c.iso);
          const logged = (workouts[c.iso] || []).length > 0;
          const cls = [
            "cal-cell",
            c.iso === todayIso ? "today" : "",
            c.iso === selectedIso ? "selected" : "",
            split === "rest" && c.iso > todayIso ? "future-rest" : "",
          ].filter(Boolean).join(" ");
          const pillLabel =
            split === "upper" ? "U" :
            split === "lower" ? "L" :
            split === "rest"  ? "R" : "";
          return (
            <button key={c.iso} className={cls} onClick={() => onSelect(c.iso)}>
              <div className="cal-day">{c.d}</div>
              {pillLabel && (
                <div className={"cal-pill " + (logged ? "logged" : split)}>
                  {logged ? "✱" : pillLabel}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 12, fontSize: 11, color: "var(--text-faint)", flexWrap: "wrap" }}>
        <span><span className="cal-pill upper" style={{ marginRight: 4 }}>U</span> Upper</span>
        <span><span className="cal-pill lower" style={{ marginRight: 4 }}>L</span> Lower</span>
        <span><span className="cal-pill rest"  style={{ marginRight: 4 }}>R</span> Rest</span>
        <span><span className="cal-pill logged" style={{ marginRight: 4 }}>✱</span> Logged</span>
      </div>
    </div>
  );
}

function RoutineEditor({ routineKey, routine, onChange }) {
  const muscleList = ["Chest", "Back", "Shoulders", "Rear Delts", "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Calves", "Core", "Forearms", "Other"];
  const ex = routine.exercises || [];

  const update = (next) => onChange({ ...routine, exercises: next });

  const setItem = (i, patch) => {
    const next = [...ex];
    next[i] = { ...next[i], ...patch };
    if (patch.exercise && !patch.muscle) next[i].muscle = inferMuscle(patch.exercise);
    update(next);
  };

  const add = () => update([...ex, { exercise: "New exercise", muscle: "Other" }]);
  const remove = (i) => {
    if (!confirm("Remove this exercise from the routine?")) return;
    update(ex.filter((_, idx) => idx !== i));
  };
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= ex.length) return;
    const next = [...ex];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };

  if (routineKey === "rest") {
    return <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Rest day. No exercises needed.</div>;
  }

  if (ex.length === 0) {
    return (
      <div>
        <EmptyState icon="list">No exercises yet</EmptyState>
        <button className="btn btn-primary btn-block" onClick={add}>Add first exercise</button>
      </div>
    );
  }

  return (
    <div>
      {ex.map((item, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 8, alignItems: "center", padding: "9px 0", borderBottom: i === ex.length - 1 ? 0 : "1px solid var(--border)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button className="btn-ghost" style={{ background: "transparent", border: 0, padding: "0 4px", color: "var(--text-faint)", fontSize: 12 }} onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
            <button className="btn-ghost" style={{ background: "transparent", border: 0, padding: "0 4px", color: "var(--text-faint)", fontSize: 12 }} onClick={() => move(i, 1)} disabled={i === ex.length - 1}>▼</button>
          </div>
          <input
            type="text"
            value={item.exercise}
            onChange={(e) => setItem(i, { exercise: e.target.value })}
            style={{ background: "var(--surface-2)", padding: "8px 10px", fontSize: 13 }}
          />
          <select
            value={item.muscle || "Other"}
            onChange={(e) => setItem(i, { muscle: e.target.value })}
            style={{ fontSize: 12, padding: "8px 6px", width: "auto" }}
          >
            {muscleList.map((mg) => <option key={mg} value={mg}>{mg}</option>)}
          </select>
          <button className="btn btn-small btn-danger" onClick={() => remove(i)}>×</button>
        </div>
      ))}
      <button className="btn btn-block" style={{ marginTop: 10 }} onClick={add}>+ Add exercise</button>
    </div>
  );
}

function PlanTab({ store, showToast, goToWorkout }) {
  const plan = store.state.plan;
  const todayIso = todayISO();
  const [month, setMonth] = useState(monthOf(todayIso));
  const [selected, setSelected] = useState(todayIso);
  const [editingRoutine, setEditingRoutine] = useState(null); // upper | lower | rest

  const stepMonth = (dir) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const monthLabel = (() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  })();

  const selSplit = splitForDate(plan, selected);
  const selRoutine = selSplit ? plan.routines[selSplit] : null;
  const todaySplit = splitForDate(plan, todayIso);
  const todayRoutine = todaySplit ? plan.routines[todaySplit] : null;

  // Build "next 5 days" preview
  const nextDays = lastNDays(5, addDays(todayIso, 4)).slice(0, 5);

  const loadIntoWorkout = (date, routine) => {
    if (!routine || !routine.exercises.length) {
      showToast("No exercises in routine");
      return;
    }
    const existing = store.state.workouts[date] || [];
    if (existing.length > 0) {
      if (!confirm("This day already has logged exercises. Replace with template?")) return;
    }
    const seeded = routine.exercises.map((e) => ({
      exercise: e.exercise,
      muscle: e.muscle || inferMuscle(e.exercise),
      sets: [{ weight: 0, reps: 0, rpe: null }],
    }));
    store.setWorkout(date, seeded);
    showToast("Template loaded");
    goToWorkout(date);
  };

  return (
    <div className="page">
      {todaySplit ? (
        <div className="card">
          <div className="split-banner" style={{ margin: 0, border: 0, padding: 0, background: "transparent" }}>
            <div className={"badge-lg " + todaySplit}>{todayRoutine?.name || todaySplit}</div>
            <div className="text">
              <div className="lbl">Today</div>
              <div className="val">
                {todaySplit === "rest"
                  ? "Rest day"
                  : `${todayRoutine?.exercises?.length || 0} exercises planned`}
              </div>
            </div>
            {todaySplit !== "rest" && todayRoutine?.exercises?.length > 0 && (
              <button className="btn btn-primary btn-small" onClick={() => loadIntoWorkout(todayIso, todayRoutine)}>
                Load
              </button>
            )}
          </div>
        </div>
      ) : plan.startDate && plan.startDate > todayIso ? (
        <div className="card">
          <div className="split-banner" style={{ margin: 0, border: 0, padding: 0, background: "transparent" }}>
            <div className={"badge-lg " + plan.cycle[0]}>{plan.routines[plan.cycle[0]]?.name || plan.cycle[0]}</div>
            <div className="text">
              <div className="lbl">Plan starts</div>
              <div className="val">
                {formatDate(plan.startDate, { relative: true })} ({daysBetween(todayIso, plan.startDate)} day{daysBetween(todayIso, plan.startDate) === 1 ? "" : "s"})
              </div>
            </div>
            <button className="btn btn-small" onClick={() => { setMonth(monthOf(plan.startDate)); setSelected(plan.startDate); }}>
              View
            </button>
          </div>
        </div>
      ) : (
        <Card title="Plan">
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
            No active plan. Set a start date below.
          </div>
        </Card>
      )}

      <Card title="Up next">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
          {nextDays.map((d) => {
            const sp = splitForDate(plan, d);
            const wd = weekdayShort(d);
            const day = d.split("-")[2];
            return (
              <button
                key={d}
                onClick={() => { setMonth(monthOf(d)); setSelected(d); }}
                style={{
                  background: d === todayIso ? "var(--surface-3)" : "var(--surface-2)",
                  border: "1px solid " + (d === todayIso ? "var(--accent)" : "var(--border)"),
                  borderRadius: 8,
                  padding: "8px 4px",
                  textAlign: "center",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{wd}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: "2px 0 4px" }}>{day}</div>
                {sp && (
                  <div className={"cal-pill " + sp} style={{ display: "inline-block" }}>
                    {sp === "rest" ? "R" : sp[0].toUpperCase()}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title={monthLabel} hint={
        <span style={{ display: "flex", gap: 6 }}>
          <button className="cal-nav-btn" onClick={() => stepMonth(-1)}>‹</button>
          <button className="cal-nav-btn" onClick={() => stepMonth(1)}>›</button>
        </span>
      }>
        <Calendar
          plan={plan}
          workouts={store.state.workouts}
          monthIso={month}
          selectedIso={selected}
          todayIso={todayIso}
          onSelect={setSelected}
        />
      </Card>

      {selected && selSplit && (
        <Card title={`${formatDate(selected, { relative: true })} — ${selRoutine?.name || selSplit}`}>
          {selSplit === "rest" ? (
            <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Rest day. Recover and refuel.</div>
          ) : (
            <>
              <div className="routine-list">
                {(selRoutine?.exercises || []).map((e, i) => (
                  <div className="routine-row" key={i}>
                    <div className="num">{i + 1}</div>
                    <div>
                      <div className="name">{e.exercise}</div>
                      <div className="muscle">{e.muscle || inferMuscle(e.exercise)}</div>
                    </div>
                    <div />
                  </div>
                ))}
                {(!selRoutine?.exercises || selRoutine.exercises.length === 0) && (
                  <EmptyState icon="list">No exercises in this routine yet</EmptyState>
                )}
              </div>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn btn-primary" onClick={() => loadIntoWorkout(selected, selRoutine)}>
                  Load template into {formatDate(selected, { relative: true }).toLowerCase()}'s workout
                </button>
              </div>
            </>
          )}
        </Card>
      )}

      <Card title="Edit routines" subtitle="Exercise list only — sets and weights are logged per session.">
        <div className="btn-row" style={{ marginBottom: 12 }}>
          {plan.cycle.map((k) => (
            <button
              key={k}
              className={"btn btn-small " + (editingRoutine === k ? "btn-primary" : "")}
              onClick={() => setEditingRoutine(editingRoutine === k ? null : k)}
            >
              {plan.routines[k]?.name || k}
            </button>
          ))}
        </div>
        {editingRoutine && (
          <RoutineEditor
            routineKey={editingRoutine}
            routine={plan.routines[editingRoutine] || { name: editingRoutine, exercises: [] }}
            onChange={(next) => store.setRoutine(editingRoutine, next)}
          />
        )}
      </Card>

      <Card title="Plan settings">
        <div className="field-row">
          <div className="field">
            <label>Start date</label>
            <input type="date" value={plan.startDate || ""} onChange={(e) => store.setPlan({ startDate: e.target.value })} />
            <div className="field-hint">First day of {plan.routines[plan.cycle[0]]?.name || plan.cycle[0]}.</div>
          </div>
          <div className="field">
            <label>Cycle</label>
            <input
              type="text"
              value={plan.cycle.join(" → ")}
              onChange={(e) => {
                const parts = e.target.value.split(/[→,>\/\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
                if (parts.length) store.setPlan({ cycle: parts });
              }}
            />
            <div className="field-hint">Order matters. Use existing routine keys.</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ==========================================================================
 * 9. DAILY INPUT TAB
 * ========================================================================== */

function DailyTab({ store, showToast }) {
  const [date, setDate] = useState(todayISO());
  const day = store.state.days[date] || {};
  const { goals } = store.state;

  const update = (patch) => store.setDay(date, patch);

  // Auto-fill macros when only calories entered
  const fillMacros = () => {
    if (!day.calories) return;
    const m = estimateMacros(day.calories);
    update(m);
    showToast("Macros estimated");
  };

  // Calculate macro % of target for bars
  const macroPct = (val, target) => target ? Math.min(120, (val / target) * 100) : 0;

  return (
    <div className="page">
      <Card title="Date" hint={formatDate(date, { relative: true })}>
        <DateNav date={date} onChange={setDate} />
      </Card>

      <Card title="Nutrition" subtitle="Enter kcal — estimate macros or override.">
        <div className="field-row">
          <NumInput label="Calories" value={day.calories} onChange={(v) => update({ calories: v })} placeholder="2800" />
          <div style={{ alignSelf: "end" }}>
            <button className="btn btn-block" onClick={fillMacros} disabled={!day.calories}>Estimate macros</button>
          </div>
        </div>
        <div style={{ height: 12 }} />
        <div className="field-row-3">
          <NumInput label="Protein" value={day.protein} onChange={(v) => update({ protein: v })} suffix="g" placeholder="180" />
          <NumInput label="Carbs" value={day.carbs} onChange={(v) => update({ carbs: v })} suffix="g" placeholder="320" />
          <NumInput label="Fats" value={day.fats} onChange={(v) => update({ fats: v })} suffix="g" placeholder="80" />
        </div>
        {(day.protein || day.carbs || day.fats) && (
          <div style={{ marginTop: 14 }}>
            <div className="macro-bar">
              <div className="macro-head"><span className="name">Protein</span><span>{day.protein || 0}g / {goals.proteinTarget}g</span></div>
              <div className="macro-track"><div className="macro-fill protein" style={{ width: `${macroPct(day.protein, goals.proteinTarget)}%` }} /></div>
            </div>
            <div className="macro-bar">
              <div className="macro-head"><span className="name">Carbs</span><span>{day.carbs || 0}g / {goals.carbsTarget}g</span></div>
              <div className="macro-track"><div className="macro-fill carbs" style={{ width: `${macroPct(day.carbs, goals.carbsTarget)}%` }} /></div>
            </div>
            <div className="macro-bar">
              <div className="macro-head"><span className="name">Fats</span><span>{day.fats || 0}g / {goals.fatsTarget}g</span></div>
              <div className="macro-track"><div className="macro-fill fats" style={{ width: `${macroPct(day.fats, goals.fatsTarget)}%` }} /></div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8, textAlign: "right" }}>
              From macros: {caloriesFromMacros(day.protein, day.carbs, day.fats)} kcal
            </div>
          </div>
        )}
      </Card>

      <Card title="Recovery & Mood">
        <Slider label={`Sleep (${day.sleep || 0}h)`} value={day.sleep || 0} onChange={(v) => update({ sleep: v })} min={0} max={12} step={0.5} unit="h" />
        <div style={{ height: 6 }} />
        <Slider label="Stress (1–10)" value={day.stress} onChange={(v) => update({ stress: v })} />
        <div style={{ height: 6 }} />
        <Slider label="Energy (1–10)" value={day.energy} onChange={(v) => update({ energy: v })} />
        <div style={{ height: 6 }} />
        <Slider label="Hunger (1–10)" value={day.hunger} onChange={(v) => update({ hunger: v })} />
      </Card>

      <Card title="Hydration & Supplements">
        <Slider label={`Water (${day.water || 0}L)`} value={day.water || 0} onChange={(v) => update({ water: v })} min={0} max={6} step={0.25} unit="L" />
        <div style={{ height: 14 }} />
        <label style={{ fontSize: 12, color: "var(--text-dim)", display: "block", marginBottom: 8 }}>Supplements taken</label>
        <div className="checks">
          {["Vitamin D", "Zinc", "Magnesium", "Fish Oil"].map((s) => {
            const key = s.toLowerCase().replace(/[^a-z]/g, "");
            const sup = day.supplements || {};
            return (
              <Check
                key={key}
                label={s}
                checked={sup[key]}
                onChange={(v) => update({ supplements: { ...sup, [key]: v } })}
              />
            );
          })}
        </div>
      </Card>

      <Card title="Notes">
        <TextInput
          label="Meal timing (pre/post workout)"
          value={day.mealTiming}
          onChange={(v) => update({ mealTiming: v })}
          placeholder="e.g. ate 2h before, banana + rice cakes post"
        />
        <div style={{ height: 10 }} />
        <TextInput
          label="How did today go?"
          value={day.notes}
          onChange={(v) => update({ notes: v })}
          placeholder="Free text — pump, mood, anything off…"
          multiline
        />
      </Card>

      <Card title="Optional metrics" hint="if relevant">
        <div className="field-row">
          <NumInput label="Digestion (1–10)" value={day.digestion} onChange={(v) => update({ digestion: v })} placeholder="8" />
          <NumInput label="Resting HR" value={day.restingHR} onChange={(v) => update({ restingHR: v })} suffix="bpm" placeholder="60" />
        </div>
        <div style={{ height: 10 }} />
        <TextInput
          label="Injury / pain (free text)"
          value={day.injuryNote}
          onChange={(v) => update({ injuryNote: v })}
          placeholder="e.g. left shoulder 4/10 during pressing"
        />
      </Card>

      <button className="btn btn-primary btn-block" onClick={() => showToast("Saved")}>
        Done for today
      </button>
    </div>
  );
}

/* ==========================================================================
 * 10. BODY COMPOSITION TAB
 * ========================================================================== */

function BodyTab({ store, showToast }) {
  const [date, setDate] = useState(todayISO());
  const day = store.state.days[date] || {};
  const photo = store.state.photos[date];

  const update = (patch) => store.setDay(date, patch);

  const onPhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Resize before saving to localStorage to stay under quota
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 600;
        const ratio = Math.min(1, maxW / img.width);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        store.setPhoto(date, dataUrl);
        showToast("Photo saved");
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Weight trend
  const days = store.state.days;
  const weightEntries = Object.entries(days)
    .filter(([_, d]) => d.weight)
    .sort(([a], [b]) => a.localeCompare(b));

  const [range, setRange] = useState("30"); // days
  const cutoff = addDays(todayISO(), -parseInt(range, 10));
  const ranged = weightEntries.filter(([d]) => d >= cutoff);

  const startWeight = weightEntries.length ? weightEntries[0][1].weight : null;
  const currentWeight = weightEntries.length ? weightEntries[weightEntries.length - 1][1].weight : null;
  const totalChange = (startWeight && currentWeight) ? currentWeight - startWeight : null;
  const totalChangePct = (startWeight && totalChange !== null) ? (totalChange / startWeight) * 100 : null;

  const rangeStart = ranged.length ? ranged[0][1].weight : null;
  const rangeChange = (rangeStart && currentWeight) ? currentWeight - rangeStart : null;

  // Recent photos
  const photoEntries = Object.entries(store.state.photos)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 9);

  return (
    <div className="page">
      <Card title="Today's body data" hint={formatDate(date, { relative: true })}>
        <DateNav date={date} onChange={setDate} />
        <div style={{ height: 12 }} />
        <div className="field-row">
          <NumInput
            label="Bodyweight"
            value={day.weight}
            onChange={(v) => update({ weight: v })}
            suffix="kg"
            placeholder="82.5"
            step="0.1"
          />
          <TextInput
            label="Conditions"
            value={day.weightNotes}
            onChange={(v) => update({ weightNotes: v })}
            placeholder="morning, fasted"
          />
        </div>
        <div style={{ height: 14 }} />
        <label style={{ fontSize: 12, color: "var(--text-dim)", display: "block", marginBottom: 8 }}>Progress photo</label>
        {photo ? (
          <div style={{ position: "relative", maxWidth: 240 }}>
            <img src={photo} style={{ width: "100%", borderRadius: "var(--radius-sm)", display: "block" }} alt="progress" />
            <button
              className="btn btn-danger btn-small"
              style={{ marginTop: 8 }}
              onClick={() => { if (confirm("Remove photo?")) store.removePhoto(date); }}
            >Remove</button>
          </div>
        ) : (
          <label className="btn btn-ghost btn-block" style={{ textAlign: "center", display: "block" }}>
            <input type="file" accept="image/*" capture="environment" onChange={onPhotoChange} style={{ display: "none" }} />
            Tap to upload photo
          </label>
        )}
      </Card>

      <Card title="Weight trend" hint={`${ranged.length} entries`}>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          {[
            ["7", "Week"], ["30", "Month"], ["90", "3 mo"], ["365", "Year"]
          ].map(([v, l]) => (
            <button key={v} className={"btn btn-small " + (range === v ? "btn-primary" : "")} onClick={() => setRange(v)}>{l}</button>
          ))}
        </div>
        {ranged.length >= 2 ? (
          <LineChart
            labels={ranged.map(([d]) => formatDate(d))}
            datasets={[{
              label: "Weight (kg)",
              data: ranged.map(([_, d]) => d.weight),
              borderColor: "#10b981",
              backgroundColor: "rgba(16,185,129,0.15)",
              fill: true,
            }]}
            yLabel="kg"
          />
        ) : (
          <EmptyState icon="weight">Add 2+ entries to see trend</EmptyState>
        )}
        <div className="stat-grid stat-grid-3" style={{ marginTop: 14 }}>
          <Stat label="Current" value={currentWeight ? fmt(currentWeight) : "—"} unit="kg" />
          <Stat
            label={`Δ ${range}d`}
            value={rangeChange !== null ? (rangeChange >= 0 ? "+" : "") + fmt(rangeChange) : "—"}
            unit="kg"
            deltaDir={rangeChange === null ? "flat" : rangeChange > 0 ? "up" : rangeChange < 0 ? "down" : "flat"}
          />
          <Stat
            label="Total Δ"
            value={totalChange !== null ? (totalChange >= 0 ? "+" : "") + fmt(totalChange) : "—"}
            unit="kg"
            delta={totalChangePct !== null ? (totalChangePct >= 0 ? "+" : "") + fmt(totalChangePct) + "%" : null}
            deltaDir={totalChange === null ? "flat" : totalChange > 0 ? "up" : totalChange < 0 ? "down" : "flat"}
          />
        </div>
      </Card>

      <Card title="Recent photos" hint={`${Object.keys(store.state.photos).length} total`}>
        {photoEntries.length === 0 ? (
          <EmptyState icon="camera">No photos yet</EmptyState>
        ) : (
          <div className="photo-grid">
            {photoEntries.map(([d, url]) => (
              <div key={d} className="photo-cell" onClick={() => setDate(d)}>
                <img src={url} alt={d} />
                <div className="date">{formatDate(d)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ==========================================================================
 * 11. WORKOUT TAB (with Hevy paste import)
 * ========================================================================== */

function WorkoutTab({ store, showToast, initialDate, clearInitialDate }) {
  const [date, setDate] = useState(initialDate || todayISO());
  // If parent sends a new initialDate (e.g. from Plan tab), sync once.
  useEffect(() => {
    if (initialDate && initialDate !== date) {
      setDate(initialDate);
      clearInitialDate && clearInitialDate();
    }
    // eslint-disable-next-line
  }, [initialDate]);

  const workout = store.state.workouts[date] || [];
  const [pasteText, setPasteText] = useState("");
  const [parseWarn, setParseWarn] = useState([]);

  // Plan-aware: if this date matches a planned split and workout is empty, offer template.
  const plan = store.state.plan;
  const plannedSplit = splitForDate(plan, date);
  const plannedRoutine = plannedSplit ? plan.routines[plannedSplit] : null;
  const showTemplateBanner =
    plannedSplit &&
    plannedSplit !== "rest" &&
    plannedRoutine &&
    plannedRoutine.exercises &&
    plannedRoutine.exercises.length > 0 &&
    workout.length === 0;

  const loadTemplate = () => {
    const seeded = plannedRoutine.exercises.map((e) => ({
      exercise: e.exercise,
      muscle: e.muscle || inferMuscle(e.exercise),
      sets: [{ weight: 0, reps: 0, rpe: null }],
    }));
    store.setWorkout(date, seeded);
    showToast("Template loaded");
  };

  const setExercises = (next) => store.setWorkout(date, next);

  const addExercise = () => {
    setExercises([...workout, { exercise: "New exercise", muscle: "Other", sets: [{ weight: 0, reps: 0, rpe: null }] }]);
  };

  const updateExercise = (i, patch) => {
    const next = [...workout];
    next[i] = { ...next[i], ...patch };
    if (patch.exercise && !patch.muscle) next[i].muscle = inferMuscle(patch.exercise);
    setExercises(next);
  };

  const removeExercise = (i) => {
    if (!confirm("Delete this exercise?")) return;
    setExercises(workout.filter((_, idx) => idx !== i));
  };

  const updateSet = (exI, setI, patch) => {
    const next = [...workout];
    const sets = [...next[exI].sets];
    sets[setI] = { ...sets[setI], ...patch };
    next[exI] = { ...next[exI], sets };
    setExercises(next);
  };

  const addSet = (exI) => {
    const next = [...workout];
    const last = next[exI].sets[next[exI].sets.length - 1] || { weight: 0, reps: 0, rpe: null };
    next[exI] = { ...next[exI], sets: [...next[exI].sets, { ...last }] };
    setExercises(next);
  };

  const removeSet = (exI, setI) => {
    const next = [...workout];
    next[exI] = { ...next[exI], sets: next[exI].sets.filter((_, idx) => idx !== setI) };
    setExercises(next);
  };

  const doImport = () => {
    const { exercises, warnings } = parseHevyText(pasteText);
    if (exercises.length) {
      setExercises([...workout, ...exercises]);
      setPasteText("");
      showToast(`Imported ${exercises.length} exercises`);
    }
    setParseWarn(warnings);
  };

  const vol = volumeOfWorkout(workout);
  const muscleList = ["Chest", "Back", "Shoulders", "Rear Delts", "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Calves", "Core", "Forearms", "Other"];

  // Find session-level data (duration etc) — stored on workouts[date].meta as element 0? simpler: derive
  const dayObj = store.state.days[date] || {};

  return (
    <div className="page">
      <Card title="Session" hint={formatDate(date, { relative: true })}>
        <DateNav date={date} onChange={setDate} />
        {plannedSplit && (
          <div className="split-banner" style={{ marginTop: 12, marginBottom: 0 }}>
            <div className={"badge-lg " + plannedSplit}>{plannedRoutine?.name || plannedSplit}</div>
            <div className="text">
              <div className="lbl">Planned</div>
              <div className="val">
                {plannedSplit === "rest"
                  ? "Rest day"
                  : `${plannedRoutine?.exercises?.length || 0} exercises`}
              </div>
            </div>
            {showTemplateBanner && (
              <button className="btn btn-primary btn-small" onClick={loadTemplate}>Load</button>
            )}
          </div>
        )}
        <div style={{ height: 12 }} />
        <div className="field-row">
          <NumInput
            label="Duration (min)"
            value={dayObj.sessionDuration}
            onChange={(v) => store.setDay(date, { sessionDuration: v })}
            placeholder="60"
          />
          <NumInput
            label="Perceived difficulty"
            value={dayObj.sessionDifficulty}
            onChange={(v) => store.setDay(date, { sessionDifficulty: v })}
            placeholder="7"
          />
        </div>
      </Card>

      <Card title="Import from Hevy" subtitle="Hevy app → Share workout → paste below.">
        <textarea
          rows={6}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={"Bench Press (Barbell)\nSet 1: 80kg × 8\nSet 2: 80kg × 7 @ 8\n\nIncline DB Press\nSet 1: 30kg × 10\n…"}
          style={{ minHeight: 130, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }}
        />
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={doImport} disabled={!pasteText.trim()}>Parse & add</button>
          <button className="btn" onClick={() => { setPasteText(""); setParseWarn([]); }}>Clear</button>
        </div>
        {parseWarn.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--warn)" }}>
            {parseWarn.map((w, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 4 }}>
                <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="alert" size={14} /></span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Exercises"
        hint={vol.setCount > 0 ? `${vol.setCount} sets · ${fmt(vol.totalVolume)} kg vol${vol.avgRPE ? ` · RPE ${fmt(vol.avgRPE, 1)}` : ""}` : ""}
      >
        {workout.length === 0 ? (
          <EmptyState icon="dumbbell">Paste from Hevy above, or add manually</EmptyState>
        ) : (
          workout.map((ex, i) => (
            <div className="ex-block" key={i}>
              <div className="ex-head">
                <input
                  type="text"
                  value={ex.exercise}
                  onChange={(e) => updateExercise(i, { exercise: e.target.value })}
                  style={{ background: "transparent", border: 0, padding: 0, fontWeight: 600, fontSize: 14, flex: 1 }}
                />
                <button className="btn btn-small btn-danger" onClick={() => removeExercise(i)} style={{ marginLeft: 8 }}>×</button>
              </div>
              <select
                value={ex.muscle}
                onChange={(e) => updateExercise(i, { muscle: e.target.value })}
                style={{ marginBottom: 8, fontSize: 12, padding: "6px 8px" }}
              >
                {muscleList.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <div className="set-row" style={{ fontSize: 11, color: "var(--text-faint)" }}>
                <span></span>
                <span>kg</span>
                <span>reps</span>
                <span>RPE</span>
                <span></span>
              </div>
              {ex.sets.map((s, si) => (
                <div className="set-row" key={si}>
                  <span className="set-num">{si + 1}</span>
                  <input type="number" inputMode="decimal" step="0.5" value={s.weight ?? ""} onChange={(e) => updateSet(i, si, { weight: parseFloat(e.target.value) || 0 })} />
                  <input type="number" inputMode="numeric" value={s.reps ?? ""} onChange={(e) => updateSet(i, si, { reps: parseInt(e.target.value) || 0 })} />
                  <input type="number" inputMode="decimal" step="0.5" value={s.rpe ?? ""} placeholder="—" onChange={(e) => updateSet(i, si, { rpe: e.target.value === "" ? null : parseFloat(e.target.value) })} />
                  <button className="icon-btn" onClick={() => removeSet(i, si)}>×</button>
                </div>
              ))}
              <button className="btn btn-small" style={{ marginTop: 8 }} onClick={() => addSet(i)}>+ Set</button>
            </div>
          ))
        )}
        <button className="btn btn-block" onClick={addExercise} style={{ marginTop: 4 }}>+ Add exercise</button>
      </Card>
    </div>
  );
}

/* ==========================================================================
 * 12. STATS TAB (consolidates: training, recovery, compliance, monthly)
 * ========================================================================== */

function SectionHeader({ children }) {
  return <div className="section-h">{children}</div>;
}

function StatsTab({ store }) {
  const [range, setRange] = useState(30);
  const todayIso = todayISO();
  const days = lastNDays(range);
  const dayData = days.map((d) => store.state.days[d] || {});
  const workouts = store.state.workouts;

  // Sessions in range
  const sessionDates = days.filter((d) => (workouts[d] || []).length > 0);

  // Aggregate volume + RPE across range
  const muscleVol = {};
  let totalVol = 0;
  let totalSets = 0;
  let rpeWSum = 0;
  let rpeWCount = 0;
  sessionDates.forEach((d) => {
    const v = volumeOfWorkout(workouts[d]);
    Object.entries(v.byMuscle).forEach(([m, vol]) => { muscleVol[m] = (muscleVol[m] || 0) + vol; });
    totalVol += v.totalVolume;
    totalSets += v.setCount;
    if (v.avgRPE) { rpeWSum += v.avgRPE * v.setCount; rpeWCount += v.setCount; }
  });
  const avgRPE = rpeWCount ? rpeWSum / rpeWCount : 0;
  const muscleSorted = Object.entries(muscleVol).sort(([, a], [, b]) => b - a);

  // Bodyweight delta over range
  const weightEntries = days.map((d) => ({ d, w: store.state.days[d]?.weight })).filter((x) => x.w);
  const wStart = weightEntries[0]?.w;
  const wEnd = weightEntries[weightEntries.length - 1]?.w;
  const wDelta = (wStart && wEnd) ? wEnd - wStart : null;

  const avgOf = (key) => {
    const vals = dayData.map((d) => d[key]).filter((v) => v != null);
    return vals.length ? avg(vals) : null;
  };

  // Compliance
  const goals = store.state.goals;
  const calHits = dayData.filter((d) => d.calories && Math.abs(d.calories - goals.calorieTarget) <= goals.calorieTarget * 0.1).length;
  const pHits   = dayData.filter((d) => d.protein && d.protein >= goals.proteinTarget * 0.95).length;
  const sHits   = dayData.filter((d) => d.sleep && d.sleep >= goals.sleepTarget - 0.5).length;
  const wHits   = dayData.filter((d) => d.water && d.water >= goals.waterTarget).length;
  const logged  = dayData.filter((d) => Object.keys(d).length > 1).length;
  const expectedWorkouts = Math.max(1, (range / 7) * goals.workoutsPerWeek);
  const workoutPct = (sessionDates.length / expectedWorkouts) * 100;

  // PRs (best top set per exercise, all time) — show those whose date falls in range
  const allTimeBest = {};
  Object.entries(workouts).forEach(([d, w]) => {
    (w || []).forEach((ex) => {
      let best = null;
      (ex.sets || []).forEach((s) => {
        if (!s.reps || !s.weight) return;
        if (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) {
          best = { weight: s.weight, reps: s.reps, date: d };
        }
      });
      if (!best) return;
      const cur = allTimeBest[ex.exercise];
      if (!cur || best.weight > cur.weight || (best.weight === cur.weight && best.reps > cur.reps)) {
        allTimeBest[ex.exercise] = best;
      }
    });
  });
  const rangeStart = days[0];
  const prsInRange = Object.entries(allTimeBest)
    .filter(([, p]) => p.date >= rangeStart && p.date <= todayIso)
    .sort((a, b) => b[1].weight - a[1].weight);

  // Overload suggestions
  const overloadHints = useMemo(() => {
    const byExercise = {};
    Object.entries(workouts).sort(([a], [b]) => a.localeCompare(b)).forEach(([d, w]) => {
      (w || []).forEach((ex) => {
        let top = null;
        (ex.sets || []).forEach((s) => {
          if (!s.reps || !s.weight) return;
          if (!top || s.weight * s.reps > top.weight * top.reps) top = { weight: s.weight, reps: s.reps, rpe: s.rpe };
        });
        if (top) {
          byExercise[ex.exercise] = byExercise[ex.exercise] || [];
          byExercise[ex.exercise].push({ date: d, top });
        }
      });
    });
    const hints = [];
    Object.entries(byExercise).forEach(([name, log]) => {
      if (log.length < 1) return;
      const last = log[log.length - 1];
      const prev = log[log.length - 2];
      let suggestion;
      if (last.top.rpe && last.top.rpe <= 7) suggestion = `+2.5 kg or +1 rep next time (RPE ${last.top.rpe})`;
      else if (last.top.reps >= 12) suggestion = `+2.5 kg, reset to 6–8 reps`;
      else if (prev && last.top.weight === prev.top.weight && last.top.reps === prev.top.reps) suggestion = `Stalled — try +1 rep, deload, or vary stimulus`;
      else if (last.top.reps < 6) suggestion = `Strong load. Add 1 rep before adding weight.`;
      else suggestion = `Add 1 rep, then +2.5 kg when reps ≥ 10`;
      hints.push({ name, last, prev, suggestion });
    });
    return hints.sort((a, b) => b.last.date.localeCompare(a.last.date)).slice(0, 6);
  }, [workouts]);

  const labels = days.map((d) => formatDate(d).replace(",", ""));
  const series = (key) => dayData.map((d) => (d[key] != null ? d[key] : null));

  const rangeLabel = range === 7 ? "this week" : range === 30 ? "this month" : range === 90 ? "last 90 days" : "last year";

  return (
    <div className="page">
      <div className="range-row">
        {[[7, "Week"], [30, "Month"], [90, "3 mo"], [365, "Year"]].map(([n, l]) => (
          <button key={n} className={"range-btn " + (range === n ? "active" : "")} onClick={() => setRange(n)}>{l}</button>
        ))}
      </div>

      <SectionHeader>Overview · {rangeLabel}</SectionHeader>
      <Card>
        <div className="stat-grid stat-grid-3">
          <Stat label="Sessions" value={sessionDates.length} />
          <Stat label="Sets" value={totalSets} />
          <Stat label="Total vol" value={fmt(totalVol, 0)} unit="kg" />
        </div>
        <div style={{ height: 10 }} />
        <div className="stat-grid stat-grid-3">
          <Stat label="Avg sleep" value={avgOf("sleep") ? fmt(avgOf("sleep"), 1) : "—"} unit="h" />
          <Stat label="Avg kcal" value={avgOf("calories") ? fmt(avgOf("calories"), 0) : "—"} />
          <Stat
            label="Weight Δ"
            value={wDelta !== null ? (wDelta >= 0 ? "+" : "") + fmt(wDelta, 1) : "—"}
            unit="kg"
            deltaDir={wDelta === null ? "flat" : wDelta > 0 ? "up" : "down"}
          />
        </div>
        <div style={{ height: 10 }} />
        <div className="stat-grid stat-grid-3">
          <Stat label="Avg protein" value={avgOf("protein") ? fmt(avgOf("protein"), 0) : "—"} unit="g" />
          <Stat label="Avg carbs" value={avgOf("carbs") ? fmt(avgOf("carbs"), 0) : "—"} unit="g" />
          <Stat label="Avg fats" value={avgOf("fats") ? fmt(avgOf("fats"), 0) : "—"} unit="g" />
        </div>
        <div style={{ height: 10 }} />
        <div className="stat-grid stat-grid-3">
          <Stat label="Avg stress" value={avgOf("stress") ? fmt(avgOf("stress"), 1) : "—"} unit="/10" />
          <Stat label="Avg energy" value={avgOf("energy") ? fmt(avgOf("energy"), 1) : "—"} unit="/10" />
          <Stat label="Avg RPE" value={avgRPE ? fmt(avgRPE, 1) : "—"} />
        </div>
      </Card>

      <SectionHeader>Compliance</SectionHeader>
      <Card subtitle="% of days hitting target.">
        <div className="stat-grid">
          <ComplianceRing value={workoutPct} label="Workouts" sublabel={`${sessionDates.length}/${Math.round(expectedWorkouts)}`} />
          <ComplianceRing value={(calHits / range) * 100} label="Calorie target" />
        </div>
        <div style={{ height: 16 }} />
        <div className="stat-grid">
          <ComplianceRing value={(pHits / range) * 100} label="Protein ≥ 95%" />
          <ComplianceRing value={(sHits / range) * 100} label="Sleep" />
        </div>
        <div style={{ height: 16 }} />
        <div className="stat-grid">
          <ComplianceRing value={(wHits / range) * 100} label="Water" />
          <ComplianceRing value={(logged / range) * 100} label="Days logged" />
        </div>
      </Card>

      <SectionHeader>Training</SectionHeader>
      <Card title="Volume per muscle" subtitle="Total kg lifted">
        {muscleSorted.length === 0 ? (
          <EmptyState icon="bars">Log a workout to see breakdown</EmptyState>
        ) : (
          <BarChart
            labels={muscleSorted.map(([m]) => m)}
            data={muscleSorted.map(([, v]) => Math.round(v))}
            color="#10b981"
            yLabel="kg"
          />
        )}
      </Card>

      <Card title="Progressive overload" subtitle="Suggestion based on last top set.">
        {overloadHints.length === 0 ? (
          <EmptyState icon="trend">Log workouts for suggestions</EmptyState>
        ) : (
          <div>
            {overloadHints.map((h, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: i === overloadHints.length - 1 ? 0 : "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 600 }}>{h.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{formatDate(h.last.date)}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
                  Last top: {h.last.top.weight}kg × {h.last.top.reps}{h.last.top.rpe ? ` @ RPE ${h.last.top.rpe}` : ""}
                </div>
                <div style={{ fontSize: 13, color: "var(--accent)", marginTop: 4 }}>→ {h.suggestion}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="PRs" hint={`${prsInRange.length} in range`}>
        {prsInRange.length === 0 ? (
          <EmptyState icon="award">No PRs in range</EmptyState>
        ) : (
          prsInRange.slice(0, 10).map(([name, p]) => (
            <div className="pr-row" key={name}>
              <span className="pr-name">{name}</span>
              <span className="pr-load">{p.weight}kg × {p.reps}</span>
            </div>
          ))
        )}
      </Card>

      <SectionHeader>Recovery</SectionHeader>
      <Card title="Sleep">
        {dayData.some((d) => d.sleep) ? (
          <LineChart
            labels={labels}
            datasets={[{ label: "Sleep (h)", data: series("sleep"), borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.15)", fill: true, spanGaps: true }]}
            yMin={0} yMax={12}
          />
        ) : (
          <EmptyState icon="trend">No sleep data</EmptyState>
        )}
      </Card>

      <Card title="Stress, energy, hunger">
        {dayData.some((d) => d.stress != null || d.energy != null || d.hunger != null) ? (
          <LineChart
            labels={labels}
            datasets={[
              { label: "Stress", data: series("stress"), borderColor: "#ef4444", spanGaps: true },
              { label: "Energy", data: series("energy"), borderColor: "#10b981", spanGaps: true },
              { label: "Hunger", data: series("hunger"), borderColor: "#f59e0b", spanGaps: true },
            ]}
            yMin={1} yMax={10}
          />
        ) : (
          <EmptyState icon="trend">No mood data</EmptyState>
        )}
      </Card>

      <Card title="Calories">
        {dayData.some((d) => d.calories) ? (
          <LineChart
            labels={labels}
            datasets={[{
              label: "Calories",
              data: series("calories"),
              borderColor: "#a78bfa",
              backgroundColor: "rgba(167,139,250,0.15)",
              fill: true,
              spanGaps: true,
            }]}
          />
        ) : (
          <EmptyState icon="flame">No calorie data</EmptyState>
        )}
      </Card>

      <Card title="Water">
        {dayData.some((d) => d.water) ? (
          <LineChart
            labels={labels}
            datasets={[{ label: "Water (L)", data: series("water"), borderColor: "#06b6d4", backgroundColor: "rgba(6,182,212,0.12)", fill: true, spanGaps: true }]}
            yMin={0} yMax={6}
          />
        ) : (
          <EmptyState icon="trend">No water data</EmptyState>
        )}
      </Card>

      <SectionHeader>Per-day breakdown</SectionHeader>
      <Card hint="Last 14 in range">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Day</th><th className="num">Cal</th><th className="num">P</th><th className="num">Sleep</th><th className="num">Train</th></tr>
            </thead>
            <tbody>
              {days.slice().reverse().slice(0, 14).map((d) => {
                const day = store.state.days[d] || {};
                const trained = (workouts[d] || []).length > 0;
                const calOK = day.calories && Math.abs(day.calories - goals.calorieTarget) <= goals.calorieTarget * 0.1;
                const pOK = day.protein && day.protein >= goals.proteinTarget * 0.95;
                const sOK = day.sleep && day.sleep >= goals.sleepTarget - 0.5;
                return (
                  <tr key={d}>
                    <td>{formatDate(d, { relative: true })}</td>
                    <td className="num" style={{ color: calOK ? "var(--good)" : day.calories ? "var(--warn)" : "var(--text-faint)" }}>
                      {day.calories ? Math.round(day.calories) : "—"}
                    </td>
                    <td className="num" style={{ color: pOK ? "var(--good)" : day.protein ? "var(--warn)" : "var(--text-faint)" }}>
                      {day.protein ? Math.round(day.protein) : "—"}
                    </td>
                    <td className="num" style={{ color: sOK ? "var(--good)" : day.sleep ? "var(--warn)" : "var(--text-faint)" }}>
                      {day.sleep ? fmt(day.sleep, 1) : "—"}
                    </td>
                    <td className="num" style={{ color: trained ? "var(--good)" : "var(--text-faint)" }}>
                      {trained
                        ? <span style={{ display: "inline-flex", verticalAlign: "middle" }}><Icon name="check" size={14} /></span>
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionHeader>Sessions</SectionHeader>
      <Card hint={`${sessionDates.length}`}>
        {sessionDates.length === 0 ? (
          <EmptyState icon="list">No sessions in range</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Exercises</th><th className="num">Sets</th><th className="num">Volume</th></tr>
              </thead>
              <tbody>
                {sessionDates.slice().reverse().map((d) => {
                  const v = volumeOfWorkout(workouts[d]);
                  return (
                    <tr key={d}>
                      <td>{formatDate(d)}</td>
                      <td>{workouts[d].length}</td>
                      <td className="num">{v.setCount}</td>
                      <td className="num">{fmt(v.totalVolume, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ==========================================================================
 * 16. SETTINGS TAB
 * ========================================================================== */

function SettingsTab({ store, showToast }) {
  const { goals } = store.state;
  const fileRef = useRef(null);

  const onImport = (e) => {
    const f = e.target.files[0];
    if (f) store.importData(f);
    e.target.value = "";
  };

  return (
    <div className="page">
      <Card title="Daily targets">
        <div className="settings-row">
          <label>Calories</label>
          <input type="number" value={goals.calorieTarget} onChange={(e) => store.setGoals({ calorieTarget: parseInt(e.target.value) || 0 })} />
        </div>
        <div className="settings-row">
          <label>Protein (g)</label>
          <input type="number" value={goals.proteinTarget} onChange={(e) => store.setGoals({ proteinTarget: parseInt(e.target.value) || 0 })} />
        </div>
        <div className="settings-row">
          <label>Carbs (g)</label>
          <input type="number" value={goals.carbsTarget} onChange={(e) => store.setGoals({ carbsTarget: parseInt(e.target.value) || 0 })} />
        </div>
        <div className="settings-row">
          <label>Fats (g)</label>
          <input type="number" value={goals.fatsTarget} onChange={(e) => store.setGoals({ fatsTarget: parseInt(e.target.value) || 0 })} />
        </div>
        <div className="settings-row">
          <label>Sleep (h)</label>
          <input type="number" step="0.5" value={goals.sleepTarget} onChange={(e) => store.setGoals({ sleepTarget: parseFloat(e.target.value) || 0 })} />
        </div>
        <div className="settings-row">
          <label>Water (L)</label>
          <input type="number" step="0.25" value={goals.waterTarget} onChange={(e) => store.setGoals({ waterTarget: parseFloat(e.target.value) || 0 })} />
        </div>
        <div className="settings-row">
          <label>Workouts / week</label>
          <input type="number" value={goals.workoutsPerWeek} onChange={(e) => store.setGoals({ workoutsPerWeek: parseInt(e.target.value) || 0 })} />
        </div>
      </Card>

      <Card title="Data" subtitle="Stored locally in this browser. Export to back up.">
        <div className="btn-row">
          <button className="btn" onClick={store.exportData}>Export JSON</button>
          <button className="btn" onClick={() => fileRef.current && fileRef.current.click()}>Import JSON</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json" onChange={onImport} style={{ display: "none" }} />
        <div style={{ height: 12 }} />
        <button className="btn btn-danger btn-block" onClick={store.resetAll}>Reset all data</button>
      </Card>

      <Card title="About">
        <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
          Local-only. No account, no cloud.<br />
          Add to home screen for app-like feel.
        </div>
      </Card>
    </div>
  );
}

/* ==========================================================================
 * 17. MAIN APP
 * ========================================================================== */

function HeaderQuickStats({ store }) {
  const t = todayISO();
  const day = store.state.days[t] || {};
  const sessions = store.state.workouts[t] || [];
  const v = volumeOfWorkout(sessions);
  return (
    <div className="header-stats">
      <div className="header-stat">
        <div className="label">Cal</div>
        <div className="value">{day.calories ? Math.round(day.calories) : "—"}</div>
      </div>
      <div className="header-stat">
        <div className="label">Prot</div>
        <div className="value">{day.protein ? Math.round(day.protein) : "—"}<span style={{ fontSize: 10, color: "var(--text-faint)" }}>g</span></div>
      </div>
      <div className="header-stat">
        <div className="label">Sleep</div>
        <div className="value">{day.sleep ? fmt(day.sleep, 1) : "—"}<span style={{ fontSize: 10, color: "var(--text-faint)" }}>h</span></div>
      </div>
      <div className="header-stat">
        <div className="label">Vol</div>
        <div className="value">{v.totalVolume ? fmt(v.totalVolume, 0) : "—"}</div>
      </div>
    </div>
  );
}

function App() {
  const store = useStore();
  const [showToast, toastNode] = useToast();
  const [tab, setTab] = useState("daily");
  const [workoutInitialDate, setWorkoutInitialDate] = useState(null);

  const goToWorkout = (date) => {
    setWorkoutInitialDate(date);
    setTab("workout");
  };

  const tabs = [
    { id: "daily", label: "Today" },
    { id: "plan", label: "Plan" },
    { id: "workout", label: "Workout" },
    { id: "body", label: "Body" },
    { id: "stats", label: "Stats" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title"><span className="dot"></span>Ramiz Tracker</h1>
        <div className="app-subtitle">{formatDate(todayISO(), { relative: true, year: true })}</div>
        <HeaderQuickStats store={store} />
      </header>

      <nav className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={"tab " + (tab === t.id ? "active" : "")}
            onClick={() => setTab(t.id)}
            role="tab"
            aria-selected={tab === t.id}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "daily" && <DailyTab store={store} showToast={showToast} />}
      {tab === "plan" && <PlanTab store={store} showToast={showToast} goToWorkout={goToWorkout} />}
      {tab === "workout" && (
        <WorkoutTab
          store={store}
          showToast={showToast}
          initialDate={workoutInitialDate}
          clearInitialDate={() => setWorkoutInitialDate(null)}
        />
      )}
      {tab === "body" && <BodyTab store={store} showToast={showToast} />}
      {tab === "stats" && <StatsTab store={store} />}
      {tab === "settings" && <SettingsTab store={store} showToast={showToast} />}

      {toastNode}
    </div>
  );
}

/* ==========================================================================
 * 18. MOUNT
 * ========================================================================== */

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
