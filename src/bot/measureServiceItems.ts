import type { ServiceItemType } from "../types/order.js";

export interface MeasureServiceItem {
  key: string;
  itemType: ServiceItemType;
  buttonLabel: string;
  cardLabel: string;
}

export const measureServiceItems: MeasureServiceItem[] = [
  {
    key: "kitchen",
    itemType: "кухня",
    buttonLabel: "кухня",
    cardLabel: "кухни"
  },
  {
    key: "wardrobe",
    itemType: "шкаф",
    buttonLabel: "шкаф",
    cardLabel: "шкафа"
  },
  {
    key: "closet_niche",
    itemType: "ниша под шкаф",
    buttonLabel: "ниша под шкаф",
    cardLabel: "ниши под шкаф"
  },
  {
    key: "sink_cabinet",
    itemType: "тумба под раковину",
    buttonLabel: "тумба под раковину",
    cardLabel: "тумбы под раковину"
  },
  {
    key: "dressing_room",
    itemType: "гардеробная",
    buttonLabel: "гардеробная",
    cardLabel: "гардеробной"
  },
  {
    key: "installation",
    itemType: "инсталляция",
    buttonLabel: "инсталляция",
    cardLabel: "инсталляции"
  },
  {
    key: "tv_zone",
    itemType: "ТВ-зона",
    buttonLabel: "ТВ-зона",
    cardLabel: "ТВ-зоны"
  },
  {
    key: "work_zone",
    itemType: "рабочая зона",
    buttonLabel: "рабочая зона",
    cardLabel: "рабочей зоны"
  },
  {
    key: "wall_panels",
    itemType: "стеновые панели",
    buttonLabel: "стеновые панели",
    cardLabel: "стеновых панелей"
  },
  {
    key: "by_plan",
    itemType: "по плану",
    buttonLabel: "по плану",
    cardLabel: "по плану"
  }
];

export function getMeasureServiceItemByKey(key: string): MeasureServiceItem | undefined {
  return measureServiceItems.find((item) => item.key === key);
}

export function isMeasureServiceItemType(value: string): value is ServiceItemType {
  return measureServiceItems.some((item) => item.itemType === value);
}

export function formatMeasureServiceItemForCard(itemType: string): string {
  return measureServiceItems.find((item) => item.itemType === itemType)?.cardLabel ?? itemType;
}
