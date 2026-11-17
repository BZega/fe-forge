export function statBreakdown(base: number | string, classBonus = 0, modifier = 0): string {
  const signed = (value: number) => value >= 0 ? `+${value}` : String(value);
  return `Base Value ${base}; Class ${signed(classBonus)}; Modifier ${signed(modifier)}`;
}

export function hasStatBonus(classBonus: number, modifier = 0): boolean {
  return classBonus > 0 || modifier > 0;
}
