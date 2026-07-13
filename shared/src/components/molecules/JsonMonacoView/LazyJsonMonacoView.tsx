// LazyJsonMonacoView — code-split обёртка над JsonMonacoView. Вьюер тянется
// отдельным чанком ТОЛЬКО при открытии JSON-таба, а не на первом рендере
// detail-страницы. До готовности чанка показываем лёгкий Spin. (Имя сохранено
// исторически — JsonMonacoView больше не использует Monaco, см. его шапку.)

import { lazy, Suspense } from "react";
import { Spin } from "antd";

// Именованный экспорт → default для React.lazy.
const JsonMonacoViewLazy = lazy(() =>
  import("./JsonMonacoView").then((m) => ({ default: m.JsonMonacoView })),
);

interface Props {
  data: unknown;
  height?: string | number;
}

export function LazyJsonMonacoView({ data, height }: Props) {
  return (
    <Suspense fallback={<Spin style={{ display: "block", margin: "32px auto" }} />}>
      <JsonMonacoViewLazy data={data} height={height} />
    </Suspense>
  );
}
