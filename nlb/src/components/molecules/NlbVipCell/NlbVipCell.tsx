// NlbVipCell — VIP-адрес(а) балансировщика в колонке списка / строке обзора.
// Поля LoadBalancer `v4_address_id` / `v6_address_id` ссылаются на vpc Address
// (аллоцированный VIP). Здесь показываем сами id адресов моноширинно с
// inline-copy (CopyableId); резолв id → IP/имя адреса появится вместе с
// VIP-picker'ом. Оба id пустые → прочерк.

import type { FC } from "react";
import { CopyableId } from "@/components/atoms/CopyableId";

export interface NlbVipCellProps {
  v4AddressId?: string;
  v6AddressId?: string;
}

export const NlbVipCell: FC<NlbVipCellProps> = ({ v4AddressId, v6AddressId }) => {
  const ids = [v4AddressId, v6AddressId].filter((x): x is string => !!x);
  if (ids.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      {ids.map((id) => (
        <CopyableId key={id} id={id} />
      ))}
    </span>
  );
};
