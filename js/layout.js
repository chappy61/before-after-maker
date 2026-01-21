export function makeGridTemplate(count, layout){
  // 4枚は2x2固定
  if(count === 4) return { cols: 2, rows: 2 };

  // 縦分割＝横並び（左右）
  if(layout === "vertical") return { cols: count, rows: 1 };

  // 横分割＝縦並び（上下）
  return { cols: 1, rows: count };
}
