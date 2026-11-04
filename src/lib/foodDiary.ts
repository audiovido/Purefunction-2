export type FoodUnit = 'g' | 'oz' | 'cup' | 'tbsp' | 'piece' | 'serving';
export type NutrientSource = 'label' | 'restaurant' | 'USDA' | 'generic' | 'manual';
export interface FoodItem {
  id: string;
  name: string;
  quantity: number;
  unit: FoodUnit;
  grams: number | null;
  state: 'raw' | 'cooked' | 'unknown';
  kcal: number | null;
  protein: number | null;
  source: NutrientSource;
  sourceId: string | null;
  assumptions: string;
  version: string;
  /** gram-based nutrient densities, when source provides them */
  kcalPerGram: number | null;
  proteinPerGram: number | null;
}
export interface FoodEntry {
  id: string;
  client_id: string;
  date: string;
  description: string;
  idempotency_key: string;
  status: 'estimate' | 'confirmed' | 'incomplete';
  created_at?: string;
  items: FoodItem[];
}
export function dayTotals(entries: FoodEntry[]): { kcal: number | null; protein: number | null; hasUnknown: boolean } {
  const items = entries.flatMap(e => e.items);
  const kcal = items.filter(i => i.kcal !== null).reduce((a, i) => a + (i.kcal ?? 0), 0);
  const protein = items.filter(i => i.protein !== null).reduce((a, i) => a + (i.protein ?? 0), 0);
  return { kcal: items.some(i => i.kcal !== null) ? Math.round(kcal) : null,
    protein: items.some(i => i.protein !== null) ? Math.round(protein * 10) / 10 : null,
    hasUnknown: items.some(i => i.kcal === null || i.protein === null) };
}
export function portionUpdate(item: FoodItem, quantity: number): FoodItem {
  const q = Number.isFinite(quantity) && quantity >= 0 ? quantity : item.quantity;
  const ratio = item.quantity > 0 ? q / item.quantity : 0;
  const grams = item.grams === null ? null : item.grams * ratio;
  return { ...item, quantity: q, grams,
    kcal: item.kcalPerGram != null && grams != null ? Math.round(item.kcalPerGram * grams) : item.kcal == null ? null : Math.round(item.kcal * ratio),
    protein: item.proteinPerGram != null && grams != null ? Math.round(item.proteinPerGram * grams * 10) / 10 : item.protein == null ? null : Math.round(item.protein * ratio * 10) / 10 };
}
export const freshItem = (name = ''): FoodItem => ({ id: crypto.randomUUID(), name, quantity: 1, unit: 'serving', grams: null,
  state: 'unknown', kcal: null, protein: null, source: 'manual', sourceId: null, assumptions: '', version: 'food-v1', kcalPerGram: null, proteinPerGram: null });
