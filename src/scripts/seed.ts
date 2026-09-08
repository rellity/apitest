import { db } from '../db'
import { products } from '../db/schema'

const catalog = [
  {
    slug: 'wireless-earbuds',
    name: 'Wireless Earbuds Pro',
    description: 'Active noise cancellation, 30-hour battery life, IPX5 water resistance.',
    category: 'Electronics',
    priceCents: 249900,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/90/ActiveSound_wireless_earbuds_by_Hykker_%28POJM200483%29.jpg',
    stock: 42,
  },
  {
    slug: 'smart-watch',
    featured: true,
    name: 'Smart Watch Series 5',
    description: 'Heart rate monitor, GPS, 2-day battery, always-on display.',
    category: 'Electronics',
    priceCents: 599900,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4e/Huawei_Smartwatch_%28Band_4%29.jpg',
    stock: 18,
  },
  {
    slug: 'running-shoes',
    featured: true,
    name: 'Air Cushion Running Shoes',
    description: 'Lightweight mesh upper, responsive foam midsole, breathable.',
    category: 'Fashion',
    priceCents: 189900,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e1/Brooks_Ghost_14_GTX.jpg',
    stock: 60,
  },
  {
    slug: 'backpack',
    name: 'Everyday Commuter Backpack',
    description: 'Water-resistant, padded laptop sleeve up to 16-inch, USB charging port.',
    category: 'Fashion',
    priceCents: 149900,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Plecak_Hiker_50_L_HiMountain.jpg',
    stock: 35,
  },
  {
    slug: 'coffee-maker',
    name: 'Drip Coffee Maker',
    description: 'Programmable brew timer, 12-cup glass carafe, keep-warm plate.',
    category: 'Home',
    priceCents: 219900,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Hamilton_Beach_home_coffee_maker.jpg',
    stock: 24,
  },
  {
    slug: 'desk-lamp',
    name: 'LED Desk Lamp',
    description: 'Adjustable color temperature, touch controls, USB charging port.',
    category: 'Home',
    priceCents: 89900,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/2c/Battery_powered_LED_desk_lamp-7420.jpg',
    stock: 50,
  },
  {
    slug: 'mechanical-keyboard',
    featured: true,
    name: 'Mechanical Keyboard 75%',
    description: 'Hot-swappable switches, RGB backlight, aluminum frame.',
    category: 'Electronics',
    priceCents: 349900,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/df/Mechanical_keyboard_example.jpg',
    stock: 22,
  },
  {
    slug: 'yoga-mat',
    name: 'Non-Slip Yoga Mat',
    description: '6mm thick, eco-friendly TPE material, includes carry strap.',
    category: 'Fitness',
    priceCents: 79900,
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/50/Yoga_mat_and_water_bottle_in_a_living_room.jpg',
    stock: 70,
  },
]

for (const item of catalog) {
  await db
    .insert(products)
    .values(item)
    .onConflictDoUpdate({ target: products.slug, set: item })
}
console.log(`seeded ${catalog.length} products`)
process.exit(0)
