/* The menu, transcribed from the printed carte in assets/menus/.
   Prices are bare; styles.css renders "$".

   ── this file used to say "do not hand-edit" ──
   It was first written by tools/extract-menus.mjs, which read the item markup
   out of the three menu pages. That markup no longer exists — Phase 1 moved
   rendering into render.js and tools/strip-menu-markup.mjs emptied the pages —
   so the extractor has nothing left to read and cannot regenerate this. This
   file is now the source, edited by hand, and tools/gen-seed-sql.mjs turns it
   into the seed migration. The extractor is kept only as the record of how the
   first version was produced.

   ── where these values come from ──
   The four PDFs in assets/menus/ are the current printed menus and they are
   what this matches, section for section and price for price:

     menu – A3.pdf              breakfast, appetizers, the baked specialties,
                                hot dishes, soups
     menu – A5 - DESSERT.pdf    desserts
     menu – A5 - COFFEE.pdf     coffee & tea, smoothies, cold beverages
     menu – A4 - DRINKS.pdf     cocktails, the four wine lists, the boards

   Two liberties are taken, both deliberate. Names are title-cased and obvious
   typos are corrected ("Oat meal", "croutans"), because the printed sheets are
   inconsistent about it and the site is not. And the appellation line that sits
   in italics under a wine's name on the sheet is folded into the front of its
   description, because there is no separate field for it here.

   Three notes on the printed sheets are NOT carried, because nothing in the
   schema holds a per-section footnote: the soups' "served with bread or
   croutons", the coffee list's "add flavors $1 / extra shot +1.50", and the
   smoothies' "add ingredients". They live only on paper today. */
var SEED_MENU = {
  "food": [
    {
      "key": "breakfast",
      "tabLabel": "Breakfast",
      "heading": "Breakfast",
      "items": [
        {
          "name": "Morning Plate",
          "desc": "Mixed greens served with scrambled eggs, avocado, cream cheese and toasted sourdough. Choice of cured meats or smoked salmon.",
          "price": "21"
        },
        {
          "name": "Protein Plate",
          "desc": "A fresh mixed greens salad, avocado, scrambled eggs, quinoa and roasted salmon.",
          "price": "27"
        },
        {
          "name": "Chicken Club Sandwich",
          "desc": "Crispy chicken schnitzel with melted cheese, pesto, homemade sauce, red onions, tomato and fresh arugula, served on toasted bread.",
          "price": "16"
        },
        {
          "name": "Shakshuka",
          "desc": "Poached eggs in a rich tomato and bell pepper sauce, finished with garlic, paprika and fresh herbs. Served with warm toasted sourdough bread.",
          "price": "16"
        },
        {
          "name": "French Toast",
          "desc": "Served with strawberry jam, Greek yogurt and agave syrup.",
          "price": "15"
        },
        {
          "name": "Oatmeal",
          "desc": "Served with granola, fresh fruit and honey or maple syrup.",
          "price": "12"
        }
      ]
    },
    {
      "key": "appetizers",
      "tabLabel": "Appetizers",
      "heading": "Appetizers",
      "items": [
        {
          "name": "Assorted Pkhali",
          "desc": "Three kinds of vegetables — green beans, eggplant and beets — blended with a rich walnut paste, garlic, fresh herbs and traditional Georgian spices, served with homemade cornbread or bread.",
          "price": "22"
        },
        {
          "name": "Eggplant Rolls",
          "desc": "Roasted eggplant filled with garlic-walnut sauce, topped with pomegranate. Georgian bread +$3.",
          "price": "19"
        },
        {
          "name": "The Georgian Salad",
          "desc": "A fresh mix of tomatoes, cucumbers, onions, herbs and walnuts tossed in a traditional sunflower oil and vinegar dressing.",
          "price": "18"
        },
        {
          "name": "Aromati’s Mix Salad",
          "desc": "Fresh mixed greens with tomatoes, cucumbers, walnuts, herbs and red onions, finished with a house-made dressing. Contains pumpkin seeds.",
          "price": "18"
        },
        {
          "name": "Greek Salad",
          "desc": "A fresh mix of cucumbers, tomatoes, red onions, bell peppers, Kalamata olives and feta cheese.",
          "price": "19"
        },
        {
          "name": "Arugula Salad with Goat Cheese",
          "desc": "A fresh blend of arugula, strawberries, herbs and red onions, finished with oil and a house-made garlic dressing. Contains honey and pumpkin seeds.",
          "price": "19"
        }
      ]
    },
    {
      "key": "mains",
      "tabLabel": "Khachapuri & Breads",
      "heading": "Freshly Baked Georgian Specialties",
      "items": [
        {
          "name": "Adjaruli Khachapuri",
          "desc": "A boat-shaped khachapuri with cheese, topped with an egg yolk and butter.",
          "price": "19"
        },
        {
          "name": "Khachapuri with Arugula",
          "desc": "Freshly baked open-face Georgian bread topped with melted cheese, fresh arugula and our house sauce.",
          "price": "19"
        },
        {
          "name": "Imeruli Khachapuri",
          "desc": "Round-shaped khachapuri with a cheese filling.",
          "price": "19"
        },
        {
          "name": "Lobiani",
          "desc": "Traditional bean-filled homemade bread.",
          "price": "18"
        },
        {
          "name": "Penovani Khachapuri",
          "desc": "Puff pastry stuffed with blended cheese.",
          "price": "17"
        },
        {
          "name": "Kubdari",
          "desc": "A round-shaped bread filled with seasoned chopped beef and pork.",
          "price": "22"
        },
        {
          "name": "Penovani with Spinach",
          "desc": "Puff pastry stuffed with blended cheese and spinach.",
          "price": "18"
        },
        {
          "name": "Puri Beef Burger",
          "desc": "Juicy beef patty, fresh vegetables, cheese and signature sauce served in freshly baked Georgian puri.",
          "price": "19"
        },
        {
          "name": "Georgian Puri",
          "desc": "Freshly baked traditional Georgian bread, served hot with house-made Georgian ajika, a spicy pepper paste.",
          "price": "8"
        }
      ]
    },
    {
      "key": "hot",
      "tabLabel": "Hot Dishes",
      "heading": "Hot Dishes",
      "items": [
        {
          "name": "Khinkali",
          "desc": "Hand-folded Georgian dumplings filled with a blend of beef and pork in a rich, savory broth. Three per serving.",
          "price": "14"
        },
        {
          "name": "Kvarabia",
          "desc": "Megruli cheese dumplings, served with homemade yogurt. Three per serving.",
          "price": "14"
        },
        {
          "name": "Tolma",
          "desc": "Seasoned ground beef and pork wrapped in grape leaves, served with a creamy garlic sauce.",
          "price": "17"
        },
        {
          "name": "Lobio",
          "desc": "Slow-cooked traditional Georgian beans with special seasonings and fresh herbs, served with house-marinated vegetables and freshly baked bread.",
          "price": "21"
        }
      ]
    },
    {
      "key": "soups",
      "tabLabel": "Soups",
      "heading": "Soups",
      "items": [
        {
          "name": "Tomato Cream Soup",
          "desc": "A delicious medley of tomatoes, light cream, spices and garlic.",
          "price": "14"
        },
        {
          "name": "Broccoli & Cheddar Soup",
          "desc": "Generous pieces of broccoli, creamy sharp cheddar cheese and a touch of spice.",
          "price": "14"
        },
        {
          "name": "Matsoni Soup",
          "desc": "Georgian matsoni — a traditional yogurt similar to Greek — with rice, sour cream, eggs, onions, parsley, coriander, scallions and mint.",
          "price": "14"
        },
        {
          "name": "Lentil Soup",
          "desc": "Slow-simmered lentils, mixed greens, garlic and ground red pepper.",
          "price": "14"
        }
      ]
    },
    {
      "key": "desserts",
      "tabLabel": "Desserts",
      "heading": "Desserts",
      "items": [
        {
          "name": "Honey Cake",
          "desc": "Delicate honey-infused cake layers filled with silky caramel buttercream.",
          "price": "10"
        },
        {
          "name": "Napoleon",
          "desc": "Classic layered pastry with a delicate vanilla cream filling and crisp, golden puff pastry.",
          "price": "12"
        },
        {
          "name": "Aromati’s Signature Cheesecake",
          "desc": "Can be served with melted chocolate or pistachio cream.",
          "price": "13"
        },
        {
          "name": "Aromati’s Classic Brownie",
          "desc": "Served with ice cream and topped with walnuts.",
          "price": "11"
        },
        {
          "name": "Pelamushi",
          "desc": "Traditional Georgian grape pudding.",
          "price": "12"
        },
        {
          "name": "Warm Chocolate Molten Lava Cake",
          "desc": "Paired with vanilla ice cream and fresh strawberry.",
          "price": "13"
        }
      ]
    },
    {
      "key": "breakfast",
      "tabLabel": "Breakfast",
      "heading": "Build Your Own Breakfast",
      "isStatic": true,
      "staticId": "build"
    }
  ],
  "drinks": [
    {
      "key": "coffee",
      "tabLabel": "Coffee",
      "heading": "Coffee & Espresso",
      "sizes": [
        "Small",
        "Medium",
        "Large"
      ],
      "items": [
        {
          "name": "Espresso",
          "priceAllSizes": "3.50"
        },
        {
          "name": "Macchiato",
          "priceAllSizes": "4"
        },
        {
          "name": "Cortado",
          "priceAllSizes": "4"
        },
        {
          "name": "Americano",
          "prices": [
            "4",
            "5",
            "6"
          ]
        },
        {
          "name": "Drip Coffee",
          "desc": "Fresh pot, all morning.",
          "prices": [
            "4",
            "5",
            "6"
          ]
        },
        {
          "name": "Cold Brew",
          "desc": "Slow-steeped, served over ice.",
          "prices": [
            "5",
            "6",
            "7"
          ]
        },
        {
          "name": "Cappuccino",
          "prices": [
            "5",
            "6",
            ""
          ]
        },
        {
          "name": "Latte",
          "prices": [
            "6",
            "6.50",
            "7"
          ]
        },
        {
          "name": "Iced Latte",
          "prices": [
            "6",
            "6.50",
            "7"
          ]
        },
        {
          "name": "Mocha Latte",
          "prices": [
            "6",
            "6.50",
            "7"
          ]
        },
        {
          "name": "Iced Maple Syrup Latte",
          "prices": [
            "7",
            "7.50",
            "8"
          ]
        },
        {
          "name": "Iced Peanut Butter Latte",
          "prices": [
            "7",
            "7.50",
            "8"
          ]
        },
        {
          "name": "Iced Pistachio Latte",
          "prices": [
            "7",
            "7.50",
            "8"
          ]
        },
        {
          "name": "Iced Tiramisu Latte",
          "prices": [
            "7",
            "7.50",
            "8"
          ]
        }
      ]
    },
    {
      "key": "tea",
      "tabLabel": "Tea & Matcha",
      "heading": "Tea, Matcha & Cocoa",
      "sizes": [
        "Small",
        "Medium",
        "Large"
      ],
      "items": [
        {
          "name": "Matcha Latte",
          "prices": [
            "6",
            "6.50",
            "7"
          ]
        },
        {
          "name": "Chai Latte",
          "prices": [
            "6",
            "6.50",
            "7"
          ]
        },
        {
          "name": "Turmeric Latte",
          "prices": [
            "7",
            "7.50",
            "8"
          ]
        },
        {
          "name": "Iced Matcha",
          "desc": "Strawberry, blueberry or mango.",
          "prices": [
            "7",
            "7.50",
            "8"
          ]
        },
        {
          "name": "Hot Tea",
          "desc": "Different flavors — ask at the counter.",
          "prices": [
            "3",
            "4",
            "5"
          ]
        },
        {
          "name": "Hot Chocolate",
          "prices": [
            "5",
            "6",
            "7"
          ]
        },
        {
          "name": "Iced Tea",
          "desc": "Passion fruit.",
          "prices": [
            "4",
            "5",
            "6"
          ]
        }
      ]
    },
    {
      "key": "smoothies",
      "tabLabel": "Smoothies",
      "heading": "Smoothies",
      "items": [
        {
          "name": "Grape Harmony",
          "desc": "Smucker’s Squeeze grape jelly, banana, blueberry and zero-sugar grape juice, mixed with hazelnut.",
          "price": "12"
        },
        {
          "name": "Green Glow",
          "desc": "Coconut water, spinach, ginger, pineapple and cucumber.",
          "price": "12"
        },
        {
          "name": "Blush Velvet",
          "desc": "Almond milk, strawberry, banana, date, coconut cream and coconut flakes.",
          "price": "12"
        },
        {
          "name": "Wake Me Up",
          "desc": "Almond milk, banana, espresso, cacao nibs, cocoa powder and protein.",
          "price": "12"
        },
        {
          "name": "Power Up",
          "desc": "Almond milk, banana, cocoa powder, peanut butter and peanuts.",
          "price": "12"
        }
      ]
    },
    {
      "key": "cold",
      "tabLabel": "Cold Beverages",
      "heading": "Cold Beverages",
      "items": [
        {
          "name": "Classic Coke",
          "price": "3"
        },
        {
          "name": "Diet Coke",
          "price": "3"
        },
        {
          "name": "Orange Juice",
          "price": "6"
        },
        {
          "name": "Natural Lemonade",
          "price": "6"
        },
        {
          "name": "Georgian Lemonade",
          "desc": "Tarragon · Pear · Lemon.",
          "price": "5"
        },
        {
          "name": "Ginger Turmeric Lemonade",
          "price": "10"
        },
        {
          "name": "Strawberry Mint Lemonade",
          "price": "10"
        },
        {
          "name": "Sparkling Mango Lemonade",
          "price": "10"
        },
        {
          "tag": "750 ml",
          "name": "S.Pellegrino Sparkling Water",
          "price": "7"
        },
        {
          "tag": "750 ml",
          "name": "Borjomi Sparkling Water",
          "desc": "The Georgian mineral water, straight from Borjomi.",
          "price": "7.50"
        },
        {
          "name": "Saratoga Still Water",
          "price": "2.50"
        }
      ]
    }
  ],
  "wine": [
    {
      "key": "cocktails",
      "tabLabel": "Cocktails",
      "heading": "Cocktails",
      "items": [
        {
          "name": "Classic Aperol Spritz",
          "desc": "Aperol, prosecco, fresh orange.",
          "price": "17"
        },
        {
          "name": "Mint Mojito",
          "desc": "Sparkling wine, fresh mint, lime.",
          "price": "16"
        },
        {
          "tag": "Non-alcoholic",
          "name": "Mint Mojito",
          "desc": "Prosecco Brut DOC, fresh mint, lime.",
          "price": "14"
        },
        {
          "name": "Sparkling Grape Cocktail",
          "desc": "Sparkling wine, Prosecco Brut DOC, grape juice, lime.",
          "price": "17"
        },
        {
          "name": "Aromati’s Limoncello Spritz",
          "desc": "Prosecco Brut DOC, Amalfi Coast organic limoncello, fresh lemon.",
          "price": "18"
        },
        {
          "name": "Pomegranate Spritz",
          "desc": "Aperol, prosecco, pomegranate juice.",
          "price": "18"
        },
        {
          "name": "The Bellini",
          "desc": "White peach purée and Prosecco Brut DOC.",
          "price": "17"
        },
        {
          "name": "Mimosa",
          "desc": "Orange juice and Prosecco Brut DOC.",
          "price": "17"
        },
        {
          "name": "Espresso Martini",
          "desc": "Kahlúa coffee liqueur, fresh espresso and coffee syrup.",
          "price": "17"
        }
      ]
    },
    {
      "key": "natural",
      "tabLabel": "Natural",
      "heading": "Georgian Natural Wine",
      "items": [
        {
          "tag": "2020",
          "name": "Kisi",
          "desc": "Kakheti, Vellino. Dry amber wine with ripe apricot and peach, floral hints and a touch of citrus.",
          "price": "18",
          "pours": [
            {
              "label": "Bottle",
              "price": "72"
            }
          ]
        },
        {
          "tag": "2023",
          "name": "Saperavi",
          "desc": "Nadelebi Winery, Kakheti. Dry red wine with rich aromas of dark berries, notably black cherry and blackberry, with hints of plum and floral notes.",
          "price": "18",
          "pours": [
            {
              "label": "Bottle",
              "price": "72"
            }
          ]
        },
        {
          "tag": "2022",
          "name": "Sopromadze",
          "desc": "Tsitska · Tsolikouri · Krakhuna, Kakheti. Dry white wine with crisp acidity and fresh citrus notes.",
          "price": "18",
          "pours": [
            {
              "label": "Bottle",
              "price": "72"
            }
          ]
        },
        {
          "tag": "2020",
          "name": "Mtsvane",
          "desc": "Kakheti. Dry amber wine with primary aromas of citrus fruits such as lemon, lime and green apple, with notes of tropical fruit.",
          "price": "17",
          "pours": [
            {
              "label": "Bottle",
              "price": "68"
            }
          ]
        },
        {
          "tag": "2023",
          "name": "Rkatsiteli",
          "desc": "Khvitsia Wine, Kardenakhi — Kakheti. Dry white wine with lively acidity and floral hints.",
          "price": "17",
          "pours": [
            {
              "label": "Bottle",
              "price": "68"
            }
          ]
        },
        {
          "tag": "2022",
          "name": "Mtsvane",
          "desc": "Single vineyard Kakheti, Manavi Wines. Dry white wine with crisp green apple, juicy pear and delicate floral notes.",
          "price": "16",
          "pours": [
            {
              "label": "Bottle",
              "price": "64"
            }
          ]
        }
      ]
    },
    {
      "key": "white",
      "tabLabel": "Georgian White",
      "heading": "Georgian White Wine",
      "items": [
        {
          "name": "Goruli Mtsvane",
          "desc": "Dry white, Kartli — known for its light straw color with green tones, with intense notes of pineapple, lemon and feijoa.",
          "price": "19",
          "pours": [
            {
              "label": "Bottle",
              "price": "85"
            }
          ]
        },
        {
          "name": "Chinuri",
          "desc": "Dry white, Kartli — pale straw-colored, with strongly expressed orange and pear tones. Sparkling acidity gives the wine a special character.",
          "price": "18",
          "pours": [
            {
              "label": "Bottle",
              "price": "80"
            }
          ]
        },
        {
          "name": "Kisi Qvevri",
          "desc": "Dry amber qvevri wine, Kakheti — honey and cinnamon aromas with notes of yellow and dried fruits.",
          "price": "17",
          "pours": [
            {
              "label": "Bottle",
              "price": "70"
            }
          ]
        },
        {
          "name": "Rkatsiteli Qvevri",
          "desc": "Dry amber qvevri wine, Kakheti — pronounced spicy aromas with hints of honey and tobacco.",
          "price": "17",
          "pours": [
            {
              "label": "Bottle",
              "price": "70"
            }
          ]
        },
        {
          "name": "Tsolikouri",
          "desc": "Imereti dry white wine, with delicate aromas of yellow and white fruits.",
          "price": "16",
          "pours": [
            {
              "label": "Bottle",
              "price": "65"
            }
          ]
        },
        {
          "name": "Tvishi",
          "desc": "Naturally semi-sweet, Lechkhumi — yellow and tropical fruit aromas with citrus undertones.",
          "price": "16",
          "pours": [
            {
              "label": "Bottle",
              "price": "65"
            }
          ]
        },
        {
          "name": "Pirosmani White",
          "desc": "Kakheti — balanced, fruity profile with notes of ripe white fruit, pear, melon and citrus.",
          "price": "15",
          "pours": [
            {
              "label": "Bottle",
              "price": "60"
            }
          ]
        },
        {
          "name": "Brut",
          "desc": "Sparkling wine, Imereti · Kakheti · Kartli — known for its pale straw color, high acidity, and notes of citrus, pear and stone fruits.",
          "price": "15",
          "pours": [
            {
              "label": "Bottle",
              "price": "60"
            }
          ]
        }
      ]
    },
    {
      "key": "red",
      "tabLabel": "Georgian Red",
      "heading": "Georgian Red Wine",
      "items": [
        {
          "name": "Saperavi Legend",
          "desc": "Dry red, Kartli — aged in oak barrels, this elegant red reveals layered aromas of red and dark berries, with a smooth, well-balanced finish.",
          "price": "20",
          "pours": [
            {
              "label": "Bottle",
              "price": "90"
            }
          ]
        },
        {
          "name": "Saperavi Reserve",
          "desc": "Premium red wine, Kakheti — complex flavors of black fruit (plum, blackberry, cherry), spice and vanilla. Often aged in oak, resulting in a rich, velvety finish.",
          "price": "18",
          "pours": [
            {
              "label": "Bottle",
              "price": "70"
            }
          ]
        },
        {
          "name": "Saperavi Qvevri",
          "desc": "Dry red qvevri wine from Kakheti — aromas of dried black plum, cherry and blackberry.",
          "price": "17",
          "pours": [
            {
              "label": "Bottle",
              "price": "70"
            }
          ]
        },
        {
          "name": "Shavkapito Merlot",
          "desc": "Dry red, Kartli — crafted in the traditional Georgian barrel-aging method. Deep ruby in color, with vibrant red-fruit aromas of cherry and plum.",
          "price": "18",
          "pours": [
            {
              "label": "Bottle",
              "price": "75"
            }
          ]
        },
        {
          "name": "Mukuzani",
          "desc": "Dry red wine from Kakheti — rich dark berry aromas with hints of oak and spice.",
          "price": "18",
          "pours": [
            {
              "label": "Bottle",
              "price": "75"
            }
          ]
        },
        {
          "name": "Kindzmarauli",
          "desc": "Red semi-sweet wine, with a rich flavor of berries, plum and rose petals.",
          "price": "18",
          "pours": [
            {
              "label": "Bottle",
              "price": "70"
            }
          ]
        },
        {
          "name": "Saperavi Rosé",
          "desc": "Dry rosé — produced from the Saperavi grape variety, characterized by a fairly high acidity.",
          "price": "16",
          "pours": [
            {
              "label": "Bottle",
              "price": "64"
            }
          ]
        }
      ]
    },
    {
      "key": "european",
      "tabLabel": "European",
      "heading": "European Wine & Spirits",
      "items": [
        {
          "name": "Barbera d’Asti",
          "desc": "DOCG “Runc”, Piedmont — rich with floral tones of iris and rose, with hints of undergrowth, raspberry and plum.",
          "price": "15",
          "pours": [
            {
              "label": "Bottle",
              "price": "55"
            }
          ]
        },
        {
          "name": "Friularo",
          "desc": "Ambasciatore, Veneto — an elegant red wine with an intense aroma, featuring spicy notes, violet and sour cherry.",
          "price": "17",
          "pours": [
            {
              "label": "Bottle",
              "price": "65"
            }
          ]
        },
        {
          "name": "Prosecco Brut",
          "desc": "DOC — Castello di Roncade, Veneto. Very fine and elegant, floral and fruity, with hints of acacia flower, green apple and almonds. Dry, fresh, lively on the palate.",
          "price": "16",
          "pours": [
            {
              "label": "Bottle",
              "price": "65"
            }
          ]
        },
        {
          "name": "Chardonnay",
          "desc": "Muzic Collio — structured and fresh, with hints of apricot and green apple. Intense and refined, with a robust finish.",
          "price": "18",
          "pours": [
            {
              "label": "Bottle",
              "price": "70"
            }
          ]
        },
        {
          "name": "Sauvignon Blanc",
          "desc": "Alto Adige, Kossler — elegant and balanced, crisp acidity and a flowery aroma, with notes of white peaches and grapefruit, tropical fruit and citrus.",
          "price": "18",
          "pours": [
            {
              "label": "Bottle",
              "price": "70"
            }
          ]
        },
        {
          "name": "Falanghina del Sannio",
          "desc": "DOP — Fontanavecchia, Campania. Aromatic notes of ripe apple and citrus blossom, with hints of pear, peach and crushed stone. Crisp, with a refreshing structure.",
          "price": "18",
          "pours": [
            {
              "label": "Bottle",
              "price": "70"
            }
          ]
        },
        {
          "name": "Georgian Lager — Kazbegi",
          "price": "8.50"
        },
        {
          "tag": "12 oz",
          "name": "Corona Extra",
          "price": "6.50"
        },
        {
          "tag": "12 oz",
          "name": "Heineken",
          "price": "6"
        }
      ]
    },
    {
      "key": "boards",
      "tabLabel": "Pairings",
      "heading": "Wine Pairings",
      "items": [
        {
          "name": "Aromati’s Charcuterie & Cheese Board",
          "desc": "A selection of cured meats and artisan cheeses, served with fresh fruit, olives, nuts, jam and crackers.",
          "noPrice": true,
          "pours": [
            {
              "label": "Small",
              "price": "32"
            },
            {
              "label": "Large",
              "price": "42"
            }
          ]
        },
        {
          "name": "Cheese Board",
          "desc": "Chef’s selection of artisan cheeses, served with croutons, fresh fruit, nuts and jam.",
          "noPrice": true,
          "pours": [
            {
              "label": "Small",
              "price": "15"
            },
            {
              "label": "Large",
              "price": "25"
            }
          ]
        }
      ]
    }
  ]
};
