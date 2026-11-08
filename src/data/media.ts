/* ------------------------------------------------------------------
 * Curated gallery of animated backgrounds.
 * `price` remains as catalog metadata for Pro-only filtering/sorting; it is
 * intentionally not displayed as a price in the interface.
 * ------------------------------------------------------------------ */

export interface MediaItem {
  id: string;
  title: string;
  category: "Gradient" | "Ink" | "Particles" | "Light" | "Nature";
  price: number;
  /** 1–5 rating shown as "quality score". */
  rating: number;
  downloads: number;
  duration: string;
  resolution: string;
  creator: string;
  creatorUrl: string;
  pageUrl: string;
  video: string;
  poster: string;
  /** Session-owned uploads are the only runtime source label. */
  source?: "upload";
}

const P = "https://www.pexels.com/";
const V = "https://videos.pexels.com/video-files/";
const I = "https://images.pexels.com/videos/";

export const mediaItems: MediaItem[] = [
  {
    id: "m01", title: "Autumn Haze", category: "Gradient", price: 0, rating: 4.7, downloads: 12400,
    duration: "0:30", resolution: "1080p", creator: "Tobias Matthews",
    creatorUrl: `${P}@tobias-matthews-57769809`, pageUrl: `${P}video/blurring-colors-moving-11387730/`,
    video: `${V}11387730/11387730-hd_1920_1080_30fps.mp4`,
    poster: `${I}11387730/4k-background-autumn-color-background-videos-color-gradient-11387730.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m02", title: "Prism Blocks", category: "Gradient", price: 12, rating: 4.2, downloads: 3800,
    duration: "0:14", resolution: "1080p", creator: "Weldi 33 Studio Design",
    creatorUrl: `${P}@weldi-33-studio-design-78158983`, pageUrl: `${P}video/different-color-animation-8675541/`,
    video: `${V}8675541/8675541-hd_1920_1080_30fps.mp4`,
    poster: `${I}8675541/abstract-art-background-backgrounddesign-geometric-8675541.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m03", title: "Digital Bloom", category: "Gradient", price: 0, rating: 4.5, downloads: 8600,
    duration: "0:15", resolution: "1080p", creator: "Weldi 33 Studio Design",
    creatorUrl: `${P}@weldi-33-studio-design-78158983`, pageUrl: `${P}video/colorful-digital-abstract-8675544/`,
    video: `${V}8675544/8675544-hd_1920_1080_30fps.mp4`,
    poster: `${I}8675544/abstract-art-background-backgrounddesign-geometric-8675544.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m04", title: "Velvet Drift", category: "Gradient", price: 19, rating: 4.9, downloads: 22100,
    duration: "0:59", resolution: "1080p", creator: "Stephan LaCasse",
    creatorUrl: `${P}@stephan-lacasse-542802298`, pageUrl: `${P}video/vibrant-abstract-gradient-animation-background-29397253/`,
    video: `${V}29397253/12662097_1920_1080_30fps.mp4`,
    poster: `${I}29397253/abstract-animation-gradient-background-29397253.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m05", title: "Laser Weave", category: "Light", price: 0, rating: 4.4, downloads: 5100,
    duration: "0:09", resolution: "4K", creator: "Owais Kiani",
    creatorUrl: `${P}@owaiskiani9`, pageUrl: `${P}video/lines-moving-on-colorful-background-11933047/`,
    video: `${V}11933047/11933047-uhd_3456_2160_60fps.mp4`,
    poster: `${I}11933047/loop-abstract-11933047.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m06", title: "Soft Prism", category: "Gradient", price: 0, rating: 4.1, downloads: 9700,
    duration: "0:30", resolution: "1080p", creator: "Tobias Matthews",
    creatorUrl: `${P}@tobias-matthews-57769809`, pageUrl: `${P}video/colors-blurring-and-moving-11368306/`,
    video: `${V}11368306/11368306-hd_1920_1080_30fps.mp4`,
    poster: `${I}11368306/4k-background-abstract-background-colorful-11368306.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m07", title: "Cobalt & Amber", category: "Gradient", price: 24, rating: 4.8, downloads: 17300,
    duration: "0:15", resolution: "4K", creator: "Graphicfresh Studio",
    creatorUrl: `${P}@graphicfresh`, pageUrl: `${P}video/abstract-fluid-waves-of-blue-and-yellow-light-40415690/`,
    video: `${V}40415690/17268927_3840_2160_30fps.mp4`,
    poster: `${I}40415690/pexels-photo-40415690.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m08", title: "Silk Current", category: "Gradient", price: 0, rating: 4.6, downloads: 11200,
    duration: "0:59", resolution: "1080p", creator: "Stephan LaCasse",
    creatorUrl: `${P}@stephan-lacasse-542802298`, pageUrl: `${P}video/abstract-gradient-animation-with-flowing-waves-29397254/`,
    video: `${V}29397254/12662101_1920_1080_30fps.mp4`,
    poster: `${I}29397254/abstract-animation-gradient-background-29397254.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m09", title: "Aurora Veil", category: "Gradient", price: 9, rating: 4.3, downloads: 6400,
    duration: "0:13", resolution: "4K", creator: "Graphicfresh Studio",
    creatorUrl: `${P}@graphicfresh`, pageUrl: `${P}video/colorful-abstract-gradient-motion-40047461/`,
    video: `${V}40047461/17094683_3840_2160_30fps.mp4`,
    poster: `${I}40047461/pexels-photo-40047461.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m10", title: "Molten Loop", category: "Gradient", price: 0, rating: 4.8, downloads: 15900,
    duration: "0:20", resolution: "4K", creator: "Graphicfresh Studio",
    creatorUrl: `${P}@graphicfresh`, pageUrl: `${P}video/vibrant-abstract-gradient-fluid-background-loop-29798244/`,
    video: `${V}29798244/12802144_3840_2160_30fps.mp4`,
    poster: `${I}29798244/abstract-aesthetic-animation-art-29798244.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m11", title: "Acrylic Bloom", category: "Ink", price: 0, rating: 4.9, downloads: 20400,
    duration: "0:25", resolution: "4K", creator: "Dan Cristian Pădureț",
    creatorUrl: `${P}@paduret`, pageUrl: `${P}video/liquid-paint-in-motion-15432044/`,
    video: `${V}15432044/15432044-uhd_3840_2160_50fps.mp4`,
    poster: `${I}15432044/abstract-acrylic-art-artist-15432044.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m12", title: "Ink Nebula", category: "Ink", price: 29, rating: 4.7, downloads: 7400,
    duration: "0:40", resolution: "4K", creator: "Dan Cristian Pădureț",
    creatorUrl: `${P}@paduret`, pageUrl: `${P}video/liquid-paint-in-motion-15432034/`,
    video: `${V}15432034/15432034-uhd_3840_2160_50fps.mp4`,
    poster: `${I}15432034/abstract-acrylic-art-artist-15432034.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m13", title: "Gold Dust", category: "Particles", price: 0, rating: 4.2, downloads: 14800,
    duration: "0:02", resolution: "1080p", creator: "Rostislav Uzunov",
    creatorUrl: `${P}@rostislav`, pageUrl: `${P}video/gold-particles-19002758/`,
    video: `${V}19002758/19002758-hd_1920_1080_24fps.mp4`,
    poster: `${I}19002758/gold-particles-19002758.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m14", title: "Ember Plume", category: "Ink", price: 0, rating: 4.4, downloads: 5300,
    duration: "0:58", resolution: "1080p", creator: "StefWithAnF",
    creatorUrl: `${P}@stefwithanf-1955763`, pageUrl: `${P}video/orange-paint-in-transparent-liquid-3978418/`,
    video: `${V}3978418/3978418-hd_1920_1080_25fps.mp4`,
    poster: `${I}3978418/abstract-colours-experimental-macro-3978418.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m15", title: "Liquid Marbling", category: "Ink", price: 16, rating: 4.6, downloads: 9100,
    duration: "1:09", resolution: "1080p", creator: "StefWithAnF",
    creatorUrl: `${P}@stefwithanf-1955763`, pageUrl: `${P}video/abstract-shapes-in-colored-liquid-mix-11073551/`,
    video: `${V}11073551/11073551-hd_1920_1080_24fps.mp4`,
    poster: `${I}11073551/pexels-photo-11073551.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m16", title: "Smoke Signal", category: "Ink", price: 0, rating: 4.5, downloads: 12600,
    duration: "0:18", resolution: "1080p", creator: "ed br",
    creatorUrl: `${P}@ed-br-1727831108`, pageUrl: `${P}video/dynamic-abstract-smoke-on-dark-background-29686188/`,
    video: `${V}29686188/12767975_1920_1080_30fps.mp4`,
    poster: `${I}29686188/abstract-black-chaotic-close-up-29686188.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m17", title: "Golden Cube", category: "Particles", price: 22, rating: 4.1, downloads: 2900,
    duration: "0:10", resolution: "1080p", creator: "Nicola Narracci",
    creatorUrl: `${P}@nicola-narracci-157460431`, pageUrl: `${P}video/abstract-cube-with-gold-particle-transformation-33358592/`,
    video: `${V}33358592/14204031_1920_1080_30fps.mp4`,
    poster: `${I}33358592/pexels-photo-33358592.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m18", title: "Violet Tides", category: "Ink", price: 0, rating: 4.8, downloads: 18900,
    duration: "0:19", resolution: "4K", creator: "Dan Cristian Pădureț",
    creatorUrl: `${P}@paduret`, pageUrl: `${P}video/liquid-paint-in-motion-15431870/`,
    video: `${V}15431870/15431870-uhd_3840_2160_50fps.mp4`,
    poster: `${I}15431870/abstract-acrylic-art-artist-15431870.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m19", title: "Graphite Bloom", category: "Ink", price: 0, rating: 4.3, downloads: 6800,
    duration: "0:57", resolution: "4K", creator: "Engin Akyurt",
    creatorUrl: `${P}@enginakyurt`, pageUrl: `${P}video/slow-motion-of-a-grey-ink-in-water-6071224/`,
    video: `${V}6071224/6071224-uhd_3840_2160_30fps.mp4`,
    poster: `${I}6071224/abstract-acrylic-amazing-art-6071224.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m20", title: "Underwater Cloud", category: "Ink", price: 14, rating: 4.7, downloads: 10500,
    duration: "0:59", resolution: "4K", creator: "Engin Akyurt",
    creatorUrl: `${P}@enginakyurt`, pageUrl: `${P}video/a-cloud-of-paint-underwater-10028299/`,
    video: `${V}10028299/10028299-uhd_3840_2160_30fps.mp4`,
    poster: `${I}10028299/abstract-acrylic-amazing-art-10028299.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m21", title: "Neon Rain", category: "Light", price: 0, rating: 4.6, downloads: 13400,
    duration: "0:22", resolution: "1080p", creator: "Artyom Hunter",
    creatorUrl: `${P}@framehunter`, pageUrl: `${P}video/defocused-image-of-lights-5592047/`,
    video: `${V}5592047/5592047-hd_1920_1080_30fps.mp4`,
    poster: `${I}5592047/pexels-photo-5592047.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m22", title: "City Haze", category: "Light", price: 0, rating: 4.2, downloads: 4100,
    duration: "0:15", resolution: "4K", creator: "Tima Miroshnichenko",
    creatorUrl: `${P}@tima-miroshnichenko`, pageUrl: `${P}video/blurred-city-lights-7168423/`,
    video: `${V}7168423/7168423-uhd_3840_2160_25fps.mp4`,
    poster: `${I}7168423/pexels-photo-7168423.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m23", title: "Midnight Bokeh", category: "Light", price: 18, rating: 4.9, downloads: 19700,
    duration: "0:19", resolution: "4K", creator: "Evgenij Mikhailov",
    creatorUrl: `${P}@evgenij-mikhailov-118166450`, pageUrl: `${P}video/vibrant-city-night-lights-with-bokeh-effects-34460591/`,
    video: `${V}34460591/14601917_3840_2160_60fps.mp4`,
    poster: `${I}34460591/pexels-photo-34460591.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m24", title: "Urban Glow", category: "Light", price: 0, rating: 4.4, downloads: 7900,
    duration: "0:10", resolution: "4K", creator: "Israyosoy S.",
    creatorUrl: `${P}@israyosoy`, pageUrl: `${P}video/colorful-bokeh-lights-in-urban-nightscape-36490874/`,
    video: `${V}36490874/15473375_3840_2160_30fps.mp4`,
    poster: `${I}36490874/background-bokeh-bokeh-bokeh-background-bokeh-effect-36490874.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m25", title: "Spectrum Blur", category: "Light", price: 11, rating: 4.0, downloads: 2600,
    duration: "0:28", resolution: "1080p", creator: "Media Hopper Studio",
    creatorUrl: `${P}@media-hopper-studio-328305910`, pageUrl: `${P}video/colorful-blurry-lights-15289074/`,
    video: `${V}15289074/15289074-hd_1920_1080_25fps.mp4`,
    poster: `${I}15289074/geometric-background-lighting-lighting-effect-15289074.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m26", title: "Night Pulse", category: "Light", price: 0, rating: 4.5, downloads: 10200,
    duration: "0:14", resolution: "4K", creator: "Evgenij Mikhailov",
    creatorUrl: `${P}@evgenij-mikhailov-118166450`, pageUrl: `${P}video/colorful-nighttime-bokeh-light-display-34638025/`,
    video: `${V}34638025/14681081_3840_2160_60fps.mp4`,
    poster: `${I}34638025/pexels-photo-34638025.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m27", title: "Basalt Breakers", category: "Nature", price: 0, rating: 4.8, downloads: 16800,
    duration: "0:31", resolution: "4K", creator: "Ivan A",
    creatorUrl: `${P}@ivan-a-28490130`, pageUrl: `${P}video/top-view-of-waves-crashing-on-a-rocky-shore-11835633/`,
    video: `${V}11835633/11835633-uhd_3840_2160_60fps.mp4`,
    poster: `${I}11835633/above-sea-aerial-photography-afternoon-beach-11835633.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m28", title: "Sea Surface", category: "Nature", price: 0, rating: 4.1, downloads: 5900,
    duration: "0:12", resolution: "1080p", creator: "Mikhail Nilov",
    creatorUrl: `${P}@mikhail-nilov`, pageUrl: `${P}video/top-view-of-sea-waves-6989127/`,
    video: `${V}6989127/6989127-hd_1920_1080_25fps.mp4`,
    poster: `${I}6989127/pexels-photo-6989127.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m29", title: "Shoreline Study", category: "Nature", price: 15, rating: 4.6, downloads: 8300,
    duration: "0:11", resolution: "2K", creator: "Luigi Matta",
    creatorUrl: `${P}@luigi-matta-1107491`, pageUrl: `${P}video/sea-waves-crashing-on-a-rocky-shore-11909722/`,
    video: `${V}11909722/11909722-uhd_2560_1440_60fps.mp4`,
    poster: `${I}11909722/2022-60fps-above-above-sea-11909722.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m30", title: "Deep Current", category: "Nature", price: 0, rating: 4.9, downloads: 23100,
    duration: "0:14", resolution: "4K", creator: "Mikhail Nilov",
    creatorUrl: `${P}@mikhail-nilov`, pageUrl: `${P}video/drone-footage-of-the-sea-waves-8336026/`,
    video: `${V}8336026/8336026-uhd_4096_2160_25fps.mp4`,
    poster: `${I}8336026/aerial-air-amazing-blue-8336026.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m31", title: "Rolling Swell", category: "Nature", price: 0, rating: 4.3, downloads: 4700,
    duration: "0:19", resolution: "1080p", creator: "Asif Khan",
    creatorUrl: `${P}@asif-khan-351050208`, pageUrl: `${P}video/sea-waves-20033796/`,
    video: `${V}20033796/20033796-hd_1920_1080_30fps.mp4`,
    poster: `${I}20033796/adventure-aerial-aerial-footage-video-aerial-photography-20033796.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
  {
    id: "m32", title: "Foam Geometry", category: "Nature", price: 20, rating: 4.7, downloads: 11600,
    duration: "0:14", resolution: "4K", creator: "Zetong Li",
    creatorUrl: `${P}@zetong-li-880728`, pageUrl: `${P}video/top-view-of-sea-waves-breaking-on-the-shore-13811553/`,
    video: `${V}13811553/13811553-uhd_3840_2160_30fps.mp4`,
    poster: `${I}13811553/beach-california-coast-crashing-13811553.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200`,
  },
];

export const mediaCategories = ["All", ...Array.from(new Set(mediaItems.map((m) => m.category)))] as const;
