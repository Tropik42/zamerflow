import type { ServiceItemType } from "../types/order.js";

export interface MeasureServiceItem {
  key: string;
  itemType: ServiceItemType;
  buttonLabel: string;
  cardFirstLabel: string;
  cardListLabel: string;
}

export const measureServiceItems: MeasureServiceItem[] = [
  {
    key: "kitchen",
    itemType: "кухня",
    buttonLabel: "кухня",
    cardFirstLabel: "кухни",
    cardListLabel: "кухня"
  },
  {
    key: "wardrobe",
    itemType: "шкаф",
    buttonLabel: "шкаф",
    cardFirstLabel: "шкафа",
    cardListLabel: "шкаф"
  },
  {
    key: "closet_niche",
    itemType: "ниша под шкаф",
    buttonLabel: "ниша под шкаф",
    cardFirstLabel: "ниши под шкаф",
    cardListLabel: "ниша под шкаф"
  },
  {
    key: "sink_cabinet",
    itemType: "тумба под раковину",
    buttonLabel: "тумба под раковину",
    cardFirstLabel: "тумбы под раковину",
    cardListLabel: "тумба под раковину"
  },
  {
    key: "dressing_room",
    itemType: "гардеробная",
    buttonLabel: "гардеробная",
    cardFirstLabel: "гардеробной",
    cardListLabel: "гардеробная"
  },
  {
    key: "installation",
    itemType: "инсталляция",
    buttonLabel: "инсталляция",
    cardFirstLabel: "инсталляции",
    cardListLabel: "инсталляция"
  },
  {
    key: "tv_zone",
    itemType: "ТВ-зона",
    buttonLabel: "ТВ-зона",
    cardFirstLabel: "ТВ-зоны",
    cardListLabel: "ТВ-зона"
  },
  {
    key: "work_zone",
    itemType: "рабочая зона",
    buttonLabel: "рабочая зона",
    cardFirstLabel: "рабочей зоны",
    cardListLabel: "рабочая зона"
  },
  {
    key: "wall_panels",
    itemType: "стеновые панели",
    buttonLabel: "стеновые панели",
    cardFirstLabel: "стеновых панелей",
    cardListLabel: "стеновые панели"
  },
  {
    key: "by_plan",
    itemType: "по плану",
    buttonLabel: "по плану",
    cardFirstLabel: "по плану",
    cardListLabel: "по плану"
  }
];

const customFirstLabelRules: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^кухня(?=$|\s)/i, replacement: "кухни" },
  { pattern: /^шкаф(?=$|\s)/i, replacement: "шкафа" },
  { pattern: /^гардеробная(?=$|\s)/i, replacement: "гардеробной" },
  { pattern: /^ниша(?=$|\s)/i, replacement: "ниши" },
  { pattern: /^инсталляция(?=$|\s)/i, replacement: "инсталляции" }
];

export function getMeasureServiceItemByKey(key: string): MeasureServiceItem | undefined {
  return measureServiceItems.find((item) => item.key === key);
}

export function isMeasureServiceItemType(value: string): value is ServiceItemType {
  return measureServiceItems.some((item) => item.itemType === value);
}

export function formatMeasureServiceItemForCardFirst(itemType: string): string {
  const serviceItem = measureServiceItems.find((item) => item.itemType === itemType);
  if (serviceItem) {
    return serviceItem.cardFirstLabel;
  }

  return customFirstLabelRules.reduce(
    (result, rule) => result.replace(rule.pattern, rule.replacement),
    itemType
  );
}

export function formatMeasureServiceItemForCardList(itemType: string): string {
  return measureServiceItems.find((item) => item.itemType === itemType)?.cardListLabel ?? itemType;
}
