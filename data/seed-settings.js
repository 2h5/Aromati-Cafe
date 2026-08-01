/* Contact details and the one-off strings that appear on every page.

   Stored in the smallest form that every display can be derived from, never in
   a display form. The phone is ten digits: the site needs "+1 (332) 207-3847"
   in the footer, "+13322073847" in an href and "+1-332-207-3847" in the Google
   listing block, and deriving three formats from one value is the only way
   they cannot drift apart. Same reasoning for the Instagram handle, which the
   profile URL is built from.

   Counted before the conversion: the phone appeared 24 times across the five
   pages, the Instagram URL 17 times. */

var SEED_SETTINGS = {
  phoneDigits: "3322073847",          // 10 digits, no country code
  phoneCountry: "1",

  email: "info@aromatiNY.com",        // mixed case is deliberate — keep it

  instagramHandle: "aromatinyc",      // the URL and the "@handle" both derive

  /* Delivery. Whole URLs, not store ids: neither service documents its URL
     shape, and both of these were copied out of a working address bar, which
     is a thing the owner can also do. Deriving them would be guessing.

     An empty string means the café is not on that service, and the link is
     removed from the page rather than left pointing nowhere — the owner will
     not always be on both, and dropping one should not need a developer.

     The DoorDash link is the one Google handed over, minus its `srsltid`
     tracking parameter. Its "&" is a literal character in the path, so it is
     written "&amp;" wherever it appears in markup. */
  orderingLinks: {
    doordash: "https://www.doordash.com/store/aromati-caf%C3%A9-&-wine-bar-103-e-34th-st-new-york-40842579/97188347/",
    grubhub:  "https://www.grubhub.com/restaurant/aromati-103-east-34th-street-new-york/13363936"
  },

  address: {
    street:   "103 E 34th Street",
    locality: "New York",
    region:   "NY",
    postal:   "10016",
    country:  "US"
  },

  /* The Google listing block. Not editable content, but it lives with the
     address it describes rather than being repeated in five HTML heads. */
  schemaType: "CafeOrCoffeeShop",
  businessName: "Aromati Café & Wine Bar",
  cuisine: "Georgian"
};
