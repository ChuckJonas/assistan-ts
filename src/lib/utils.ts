export const groupBy = <T, K extends keyof T>(
  arr: T[],
  keySelector: (it: T) => string
): Record<string, T> => {
  const res: Record<string, T> = {};
  arr.forEach((it) => {
    const key = keySelector(it);
    if (!res[key]) res[key] = it;
  });
  return res;
};
