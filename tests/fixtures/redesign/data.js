export const user = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "inventory@qoima.example",
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
const createdAt = new Date();
createdAt.setDate(createdAt.getDate() - 7);
createdAt.setHours(8, 0, 0, 0);
const updatedAt = new Date();
updatedAt.setHours(9, 0, 0, 0);
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
    description: [
      "A4 white copy paper, 80 gsm.\n500 sheets per ream for everyday office printing.",
      "80 mm thermal receipt rolls for point-of-sale printers. Sold per roll.",
      "Clear packing tape, 48 mm wide. 66 m per roll for secure parcel sealing.",
      "Self-adhesive shipping labels. 100 labels per pack for parcel dispatch.",
      "Recycled kraft mailers, size M. Lightweight packaging for small orders.",
      "Smooth-writing black ballpoint pens. Ten pens per pack.",
      "Previous parcel-box format, retained for stock records.",
      "Discontinued blue ballpoint pens, retained for stock records.",
    ][index],
    created_at: createdAt.toISOString(),
    updated_at: updatedAt.toISOString(),
  }),
);
// Fictional, coherent opening balances and movements for the actual page components.
const events = [
  [6, 0, "IN", 60, 60, "Opening stock"],
  [6, 1, "IN", 30, 30, "Opening stock"],
  [6, 2, "IN", 24, 24, "Opening stock"],
  [6, 6, "IN", 30, 30, "Opening stock"],
  [5, 3, "IN", 20, 20, "Label delivery"],
  [5, 4, "IN", 150, 150, "Supplier delivery"],
  [4, 5, "IN", 80, 80, "Office supplies delivery"],
  [4, 2, "OUT", -10, 14, "Parcel dispatch"],
  [4, 6, "OUT", -12, 18, "Parcel dispatch before archival"],
  [3, 1, "OUT", -12, 18, "Counter replenishment"],
  [3, 4, "OUT", -50, 100, "Online orders dispatched"],
  [2, 2, "OUT", -12, 2, "Parcel dispatch"],
  [2, 5, "OUT", -16, 64, "Office replenishment"],
  [1, 0, "OUT", -18, 42, "Office replenishment"],
  [1, 3, "OUT", -8, 12, "Shipping desk replenishment"],
  [0, 4, "IN", 20, 120, "Supplier delivery"],
  [0, 1, "OUT", -10, 8, "Counter replenishment"],
  [0, 2, "ADJUSTMENT", -2, 0, "Two damaged rolls removed after stock count"],
];
export const movements = events
  .map(([daysAgo, productIndex, type, change, after, note], index) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(8, index * 3, 0, 0);
    return {
      type, quantity_change: change, quantity_after: after,
      id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      user_id: user.id,
      product_id: products[productIndex].id,
      product: products[productIndex],
      note,
      created_at: date.toISOString(),
    };
  })
  .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
