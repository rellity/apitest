import { CaretLeftIcon, CaretRightIcon } from './icons'

const SLIDES = [
  {
    category: 'Electronics',
    headline: 'Electronics',
    body: 'Audio, wearables, and everyday gadgets.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/df/Mechanical_keyboard_example.jpg',
  },
  {
    category: 'Fashion',
    headline: 'Fashion',
    body: 'Everyday essentials, built to last.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e1/Brooks_Ghost_14_GTX.jpg',
  },
  {
    category: 'Home',
    headline: 'Home',
    body: 'Small upgrades for everyday spaces.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Hamilton_Beach_home_coffee_maker.jpg',
  },
  {
    category: 'Fitness',
    headline: 'Fitness',
    body: 'Gear for your next workout.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/50/Yoga_mat_and_water_bottle_in_a_living_room.jpg',
  },
]

export const BannerCarousel = () => (
  <div
    x-data={`{ slide: 0, count: ${SLIDES.length}, timer: null, start() { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; this.timer = setInterval(() => { this.slide = (this.slide + 1) % this.count }, 5000) }, stop() { clearInterval(this.timer) } }`}
    x-init="start()"
    class="group relative mb-6 overflow-hidden rounded-xl"
    x-on:mouseenter="stop()"
    x-on:mouseleave="start()"
  >
    <div
      class="flex transition-transform duration-500 ease-out"
      {...{ ':style': "`transform: translateX(-${slide * 100}%)`" }}
    >
      {SLIDES.map((s) => (
        <a href={`/shop?category=${encodeURIComponent(s.category)}`} class="relative h-48 w-full shrink-0 sm:h-64">
          <img src={s.imageUrl} alt="" class="h-full w-full object-cover" />
          <div class="absolute inset-0 bg-gradient-to-r from-zinc-900/70 via-zinc-900/20 to-transparent" />
          <div class="absolute inset-0 flex flex-col justify-center gap-2 px-6 sm:px-10">
            <h2 class="font-display text-2xl font-bold text-white sm:text-3xl">{s.headline}</h2>
            <p class="max-w-xs text-sm text-white/85 sm:text-base">{s.body}</p>
            <span class="mt-1 inline-flex w-fit items-center rounded-full bg-white px-4 py-1.5 text-sm font-medium text-zinc-900">
              Shop now
            </span>
          </div>
        </a>
      ))}
    </div>

    <button
      type="button"
      x-on:click={`slide = (slide - 1 + count) % count`}
      aria-label="Previous slide"
      class="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1.5 text-zinc-700 opacity-0 transition hover:bg-white group-hover:opacity-100"
    >
      <CaretLeftIcon class="size-5" />
    </button>
    <button
      type="button"
      x-on:click="slide = (slide + 1) % count"
      aria-label="Next slide"
      class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1.5 text-zinc-700 opacity-0 transition hover:bg-white group-hover:opacity-100"
    >
      <CaretRightIcon class="size-5" />
    </button>

    <div class="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
      {SLIDES.map((_, i) => (
        <button
          type="button"
          x-on:click={`slide = ${i}`}
          aria-label={`Go to slide ${i + 1}`}
          {...{ ':class': `slide === ${i} ? 'bg-white' : 'bg-white/40'` }}
          class="size-1.5 rounded-full transition-colors"
        ></button>
      ))}
    </div>
  </div>
)
