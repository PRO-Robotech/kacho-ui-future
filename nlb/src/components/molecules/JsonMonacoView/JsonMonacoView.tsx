// JsonMonacoView — read-only JSON viewer БЕЗ внешних зависимостей: pretty-printed
// JSON.stringify(data, null, 2) в скроллируемом <pre> с лёгкой inline-подсветкой
// (ключи / строки / числа / bool / null), theme-aware через useThemeMode.
//
// Раньше это был @monaco-editor/react-редактор — на деплое Monaco грузит свой
// runtime с CDN, что падало за nginx base-path ("Monaco initialization: error:
// Event", таб висел на "Loading..."). Замена рендерится мгновенно в любом
// federation-remote независимо от base-path. Имя компонента и props {data,height}
// сохранены — LazyJsonMonacoView и все call-site'ы работают без изменений.

import { useMemo, type CSSProperties } from "react";
import { theme } from "antd";
import { useThemeMode } from "@/lib/theme-context";

interface Props {
  data: unknown;
  /** Высота вьюера. Default 60vh — занимает основную часть tab-area. */
  height?: string | number;
}

// Токен подсветки: тип + текст. Строим из JSON.stringify-вывода регуляркой по
// строкам/числам/bool/null; ключ отличаем от строки-значения по завершающему ':'.
type TokKind = "key" | "string" | "number" | "boolean" | "null" | "punct";

interface Palette {
  bg: string;
  text: string;
  key: string;
  string: string;
  number: string;
  boolean: string;
  null: string;
}

// Палитры под vs-dark / vs-light (близко к Monaco json-подсветке).
const DARK: Palette = {
  bg: "#1e1e1e",
  text: "#d4d4d4",
  key: "#9cdcfe",
  string: "#ce9178",
  number: "#b5cea8",
  boolean: "#569cd6",
  null: "#569cd6",
};
const LIGHT: Palette = {
  bg: "#ffffff",
  text: "#1f1f1f",
  key: "#0451a5",
  string: "#a31515",
  number: "#098658",
  boolean: "#0000ff",
  null: "#0000ff",
};

// Токенизирует одну строку pretty-JSON. Строковый литерал, за которым (после
// пробелов) идёт ':', — это ключ. Порядок regex важен: строки ловим первыми,
// чтобы число/bool внутри строки не подсвечивались отдельно.
const TOKEN_RE = /("(?:\\.|[^"\\])*"(\s*:)?)|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b)|(\bnull\b)/g;

function tokenizeLine(line: string): { kind: TokKind; text: string }[] {
  const out: { kind: TokKind; text: string }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(line)) !== null) {
    if (m.index > last) out.push({ kind: "punct", text: line.slice(last, m.index) });
    if (m[1] !== undefined) {
      // строка; m[2] — завершающее двоеточие (⇒ ключ)
      out.push({ kind: m[2] ? "key" : "string", text: m[1] });
    } else if (m[3] !== undefined) {
      out.push({ kind: "number", text: m[3] });
    } else if (m[4] !== undefined) {
      out.push({ kind: "boolean", text: m[4] });
    } else if (m[5] !== undefined) {
      out.push({ kind: "null", text: m[5] });
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ kind: "punct", text: line.slice(last) });
  return out;
}

function colorFor(kind: TokKind, p: Palette): string {
  switch (kind) {
    case "key":
      return p.key;
    case "string":
      return p.string;
    case "number":
      return p.number;
    case "boolean":
      return p.boolean;
    case "null":
      return p.null;
    default:
      return p.text;
  }
}

export function JsonMonacoView({ data, height = "60vh" }: Props) {
  const { token } = theme.useToken();
  const { mode } = useThemeMode();
  const palette = mode === "dark" ? DARK : LIGHT;

  // Мемоизируем сериализацию + токенизацию: detail-query поллит каждые 3-5с и
  // заново передаёт data — без memo пересчитывали бы разметку на каждый рефетч.
  const lines = useMemo(() => {
    let json: string;
    try {
      json = JSON.stringify(data, null, 2);
    } catch {
      json = String(data);
    }
    if (json === undefined) json = "undefined";
    return json.split("\n").map(tokenizeLine);
  }, [data]);

  const preStyle: CSSProperties = {
    margin: 0,
    height,
    overflow: "auto",
    background: palette.bg,
    color: palette.text,
    fontSize: 12,
    lineHeight: 1.5,
    fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace",
    padding: "8px 12px",
    tabSize: 2,
    whiteSpace: "pre",
    wordBreak: "normal",
  };

  return (
    <div
      style={{
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        overflow: "hidden",
        background: palette.bg,
      }}
    >
      <pre style={preStyle} data-testid="json-view">
        {lines.map((toks, i) => (
          <div key={i}>
            {toks.length === 0 ? (
              // сохраняем высоту пустой строки
              "​"
            ) : (
              toks.map((t, j) => (
                <span key={j} style={{ color: colorFor(t.kind, palette) }}>
                  {t.text}
                </span>
              ))
            )}
          </div>
        ))}
      </pre>
    </div>
  );
}
