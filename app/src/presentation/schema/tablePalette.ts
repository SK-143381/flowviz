/**
 * The pastel per-table header palette that gives the schema pane its ER-diagram look
 * (distinct colored header per table, like a classic crow's-foot ER tool). Cycled by table
 * index so it stays stable and deterministic without needing to store a color on the model.
 */
export const TABLE_PALETTE = [
  { header: '#fdf3c7', border: '#e0c34a', text: '#5c4a00' }, // yellow
  { header: '#f1e4fb', border: '#b57fe6', text: '#4a2a75' }, // purple
  { header: '#fbe1e1', border: '#e68a8a', text: '#7a1f1f' }, // red/coral
  { header: '#e1e9fb', border: '#8aa6e6', text: '#1f3a7a' }, // blue
  { header: '#dbf5f0', border: '#5fc9b8', text: '#0f5c4d' }, // cyan/teal
  { header: '#e6f5db', border: '#8fcf6a', text: '#2c5c14' }, // green
  { header: '#fbe9d7', border: '#e6ab6a', text: '#7a4400' }, // orange
  { header: '#fde1ef', border: '#e68ac0', text: '#7a1f52' }, // pink
];

export function tableColor(index: number) {
  return TABLE_PALETTE[index % TABLE_PALETTE.length];
}
