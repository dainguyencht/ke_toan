import { ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toISODate } from "@/lib/utils";

export type PeriodMode =
  | "day"
  | "month"
  | "quarter"
  | "year"
  | "custom"
  | "all";

export type PeriodState = {
  mode: PeriodMode;
  /** Mốc thời gian trong period (dùng cho day/month/quarter/year) */
  anchor: Date;
  customFrom: string; // YYYY-MM-DD
  customTo: string;
};

export const MODE_LABELS: Record<PeriodMode, string> = {
  day: "Ngày",
  month: "Tháng",
  quarter: "Quý",
  year: "Năm",
  custom: "Tuỳ chỉnh",
  all: "Tất cả",
};

export function initialPeriod(mode: PeriodMode = "month"): PeriodState {
  const today = toISODate(new Date());
  return { mode, anchor: new Date(), customFrom: today, customTo: today };
}

/** Với mode 'all', from/to là null (không giới hạn). */
export function periodToDates(
  p: PeriodState,
): { from: string | null; to: string | null } {
  const a = p.anchor;
  switch (p.mode) {
    case "all":
      return { from: null, to: null };
    case "day": {
      const d = toISODate(a);
      return { from: d, to: d };
    }
    case "month": {
      const from = new Date(a.getFullYear(), a.getMonth(), 1);
      const to = new Date(a.getFullYear(), a.getMonth() + 1, 0);
      return { from: toISODate(from), to: toISODate(to) };
    }
    case "quarter": {
      const q = Math.floor(a.getMonth() / 3);
      const from = new Date(a.getFullYear(), q * 3, 1);
      const to = new Date(a.getFullYear(), q * 3 + 3, 0);
      return { from: toISODate(from), to: toISODate(to) };
    }
    case "year": {
      const from = new Date(a.getFullYear(), 0, 1);
      const to = new Date(a.getFullYear(), 11, 31);
      return { from: toISODate(from), to: toISODate(to) };
    }
    case "custom":
      return { from: p.customFrom, to: p.customTo };
  }
}

export function shiftPeriod(p: PeriodState, delta: -1 | 1): PeriodState {
  const a = new Date(p.anchor);
  switch (p.mode) {
    case "day":
      a.setDate(a.getDate() + delta);
      break;
    case "month":
      a.setMonth(a.getMonth() + delta);
      break;
    case "quarter":
      a.setMonth(a.getMonth() + 3 * delta);
      break;
    case "year":
      a.setFullYear(a.getFullYear() + delta);
      break;
    default:
      return p;
  }
  return { ...p, anchor: a };
}

/** Period kế tiếp đã ở tương lai? Dùng để disable nút "Next". */
export function isAtOrAfterCurrentPeriod(p: PeriodState): boolean {
  const now = new Date();
  switch (p.mode) {
    case "day":
      return toISODate(p.anchor) >= toISODate(now);
    case "month": {
      const ay = p.anchor.getFullYear();
      const am = p.anchor.getMonth();
      return ay > now.getFullYear() ||
        (ay === now.getFullYear() && am >= now.getMonth());
    }
    case "quarter": {
      const ay = p.anchor.getFullYear();
      const aq = Math.floor(p.anchor.getMonth() / 3);
      const nq = Math.floor(now.getMonth() / 3);
      return ay > now.getFullYear() ||
        (ay === now.getFullYear() && aq >= nq);
    }
    case "year":
      return p.anchor.getFullYear() >= now.getFullYear();
    default:
      return true;
  }
}

type Props = {
  value: PeriodState;
  onChange: (v: PeriodState) => void;
  /** Subset các mode hiển thị. Mặc định = toàn bộ trừ 'all'. */
  modes?: PeriodMode[];
};

const DEFAULT_MODES: PeriodMode[] = [
  "day",
  "month",
  "quarter",
  "year",
  "custom",
];

export function PeriodFilter({ value, onChange, modes = DEFAULT_MODES }: Props) {
  const showShift =
    value.mode === "day" ||
    value.mode === "month" ||
    value.mode === "quarter" ||
    value.mode === "year";
  const nextDisabled = isAtOrAfterCurrentPeriod(value);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Tabs
        value={value.mode}
        onValueChange={(m) => onChange({ ...value, mode: m as PeriodMode })}
      >
        <TabsList>
          {modes.map((k) => (
            <TabsTrigger key={k} value={k}>
              {MODE_LABELS[k]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {showShift && (
        <div className="flex items-center gap-1">
          <NavButton
            onClick={() => onChange(shiftPeriod(value, -1))}
            label="Kỳ trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </NavButton>
          <PeriodPicker value={value} onChange={onChange} />
          <NavButton
            onClick={() => onChange(shiftPeriod(value, 1))}
            disabled={nextDisabled}
            label="Kỳ sau"
          >
            <ChevronRight className="w-4 h-4" />
          </NavButton>
        </div>
      )}

      {value.mode === "custom" && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-neutral-500">Từ:</span>
          <Input
            type="date"
            value={value.customFrom}
            onChange={(e) => onChange({ ...value, customFrom: e.target.value })}
            className="h-8 w-40"
          />
          <span className="text-neutral-500">Đến:</span>
          <Input
            type="date"
            value={value.customTo}
            onChange={(e) => onChange({ ...value, customTo: e.target.value })}
            className="h-8 w-40"
          />
        </div>
      )}
    </div>
  );
}

function NavButton({
  onClick,
  disabled,
  children,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="h-8 w-8 inline-flex items-center justify-center rounded border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodState;
  onChange: (v: PeriodState) => void;
}) {
  const setAnchor = (a: Date) => onChange({ ...value, anchor: a });
  const a = value.anchor;
  const now = new Date();
  const years: number[] = [];
  for (let y = 2020; y <= now.getFullYear() + 1; y++) years.push(y);

  if (value.mode === "day") {
    return (
      <Input
        type="date"
        value={toISODate(a)}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          const [y, m, d] = v.split("-").map(Number);
          setAnchor(new Date(y, m - 1, d));
        }}
        className="h-8 w-40"
      />
    );
  }

  if (value.mode === "month") {
    const mm = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}`;
    return (
      <Input
        type="month"
        value={mm}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          const [y, m] = v.split("-").map(Number);
          setAnchor(new Date(y, m - 1, 1));
        }}
        className="h-8 w-40"
      />
    );
  }

  if (value.mode === "year") {
    return (
      <select
        value={a.getFullYear()}
        onChange={(e) =>
          setAnchor(new Date(Number(e.target.value), a.getMonth(), 1))
        }
        className="h-8 w-28 rounded-md border border-neutral-300 bg-white px-2 text-sm"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    );
  }

  if (value.mode === "quarter") {
    const q = Math.floor(a.getMonth() / 3) + 1;
    return (
      <div className="flex items-center gap-1">
        <select
          value={q}
          onChange={(e) => {
            const newQ = Number(e.target.value);
            setAnchor(new Date(a.getFullYear(), (newQ - 1) * 3, 1));
          }}
          className="h-8 w-20 rounded-md border border-neutral-300 bg-white px-2 text-sm"
        >
          {[1, 2, 3, 4].map((qn) => (
            <option key={qn} value={qn}>
              Q{qn}
            </option>
          ))}
        </select>
        <select
          value={a.getFullYear()}
          onChange={(e) =>
            setAnchor(new Date(Number(e.target.value), (q - 1) * 3, 1))
          }
          className="h-8 w-24 rounded-md border border-neutral-300 bg-white px-2 text-sm"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return null;
}
