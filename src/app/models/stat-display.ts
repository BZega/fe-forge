export function statBreakdown(base: number | string, classBonus = 0, modifier = 0, suffix = ''): string {
  const signed = (value: number) => `${value >= 0 ? '+' : ''}${value}${suffix}`;
  return `Base Value ${base}${suffix}; Class ${signed(classBonus)}; Modifier ${signed(modifier)}`;
}

export function hasStatBonus(modifier: number): boolean {
  return modifier > 0;
}
