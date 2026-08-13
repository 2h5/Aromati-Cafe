/* The offline fallback for Build Your Own Breakfast.

   The block keeps its hand-written layout and interaction model, but its
   choices now have the same network -> localStorage -> seed path as the rest
   of the menu. Prices are bare text, as they are everywhere else on the site.
   A blank bagel price means the variety is included in the base price. */
var SEED_BREAKFAST_BUILDER = {
  base: [
    {
      label: "Avocado toast",
      price: "6",
      hint: "Smashed avocado on grilled sourdough."
    },
    {
      label: "Croissant sandwich",
      price: "7",
      hint: "Smashed avocado on a plain croissant."
    },
    {
      label: "Bagel of your choice",
      price: "3",
      hint: "Plain or everything, toasted to order.",
      sub: "bagel"
    }
  ],
  bagel: [
    { label: "Plain" },
    { label: "Everything" }
  ],
  add: [
    { label: "Cream cheese", price: "2" },
    { label: "Sliced cheese — mozzarella, American or Swiss", price: "2" },
    { label: "Scrambled eggs", price: "4" },
    { label: "Salmon", price: "4" },
    { label: "Prosciutto", price: "2" },
    { label: "Avocado", price: "2" },
    { label: "Vegetables — red onion, tomato, cucumber, capers", price: "0.50" }
  ]
};
