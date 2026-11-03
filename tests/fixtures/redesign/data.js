export const user = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "alex@northline.example",
};
export const categories = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Paper",
    user_id: user.id,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Packaging",
    user_id: user.id,
  },
];
export const products = [
  ["A4 Copy Paper", "000124", 42, 12, "4.80", "7.20", 0, false],
  ["Thermal Receipt Rolls", "000207", 8, 10, "1.60", "2.90", 0, false],
  ["Packing Tape, 48 mm", "000318", 0, 8, "1.85", "3.20", 1, false],
  ["Shipping Labels, 100-pack", "000412", 12, 12, "3.40", "5.50", 1, false],
  ["Recycled Mailers, size M", "000506", 120, 30, "0.35", "0.65", 1, false],
  [
    "Black Ballpoint Pens, 10-pack",
    "000619",
    64,
    20,
    "2.10",
    "3.80",
    null,
    false,
  ],
  ["Legacy Parcel Box", "000702", 18, 10, "2.20", "3.40", 1, true],
  ["Blue Ballpoint Pens", "000803", 0, 5, "2.10", "3.80", null, true],
].map(
  (
    [
      name,
      sku,
      quantity,
      min_stock,
      cost_price,
      selling_price,
      category,
      is_archived,
    ],
    index,
  ) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    user_id: user.id,
    name,
    sku,
    quantity,
    min_stock,
    cost_price,
    selling_price,
    is_archived,
    category_id: category === null ? null : categories[category].id,
    description: "Fictional local UI fixture.\nNo remote inventory is used.",
    created_at: "2026-11-03T08:00:00Z",
    updated_at: "2026-11-03T09:00:00Z",
  }),
);
export const movements = [
  { type: "IN", quantity_change: 20, quantity_after: 42 },
  { type: "OUT", quantity_change: -4, quantity_after: 8 },
  { type: "ADJUSTMENT", quantity_change: -2, quantity_after: 0 },
  { type: "IN", quantity_change: 12, quantity_after: 12 },
].map((movement, index) => ({
  ...movement,
  id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  user_id: user.id,
  product_id: products[index].id,
  product: products[index],
  note: "Local UI review fixture",
  created_at: new Date(Date.now() - index * 86400000).toISOString(),
}));
