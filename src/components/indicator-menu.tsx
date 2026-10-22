import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChartLine, Check } from "lucide-react";
import { clsx } from "clsx";
import type { IndicatorId } from "@/lib/prefs";

const ITEMS: { id: IndicatorId; title: string; detail: string }[] = [
  {
    id: "sma",
    title: "SMA 21",
    detail: "Media simple de 21, en amarillo",
  },
  {
    id: "mas",
    title: "Cruce de 3 medias",
    detail: "EMA 21 verde, 55 amarilla y 200 roja",
  },
  {
    id: "macd",
    title: "MACD",
    detail: "12, 26 y 9, con histograma",
  },
];

type IndicatorMenuProps = {
  active: IndicatorId[];
  onToggle: (id: IndicatorId) => void;
};

export function IndicatorMenu({ active, onToggle }: IndicatorMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Indicadores"
        className={clsx(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-surface text-fg",
          "shadow-pop transition-colors hover:bg-raised",
          active.length > 0 && "text-accent",
        )}
      >
        <ChartLine className="size-5" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          side="top"
          sideOffset={8}
          className="menu-panel z-50 rounded-md bg-surface p-1.5 shadow-pop"
        >
          {ITEMS.map((item) => {
            const on = active.includes(item.id);
            return (
              <DropdownMenu.CheckboxItem
                key={item.id}
                checked={on}
                onCheckedChange={() => onToggle(item.id)}
                onSelect={(event) => event.preventDefault()}
                className="flex cursor-pointer items-start gap-3 rounded-sm px-3 py-3 outline-none data-[highlighted]:bg-raised"
              >
                <span
                  className={clsx(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-sm border",
                    on ? "border-accent bg-accent text-bg" : "border-line bg-bg text-transparent",
                  )}
                  aria-hidden="true"
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">{item.title}</span>
                  <span className="block text-xs text-muted">{item.detail}</span>
                </span>
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
