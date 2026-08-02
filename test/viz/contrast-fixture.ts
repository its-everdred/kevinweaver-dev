const SRGB_LINEAR_CUTOFF = 0.04045

/** A CIELab lightness and opponent-channel tuple. */
export type Lab = readonly [number, number, number]

/** Raised when a contrast fixture receives a color outside six-digit sRGB hex. */
export class InvalidContrastColorError extends TypeError {
  constructor(value: string) {
    super(`invalid contrast color ${value}`)
    this.name = 'InvalidContrastColorError'
  }
}

/**
 * @description Computes relative luminance after applying an optional channel scale.
 * @param hex Six-digit sRGB color.
 * @param channelScale Multiplier applied before linearization.
 * @returns WCAG relative luminance.
 * @throws {InvalidContrastColorError} When hex is not a six-digit sRGB color.
 */
export function relativeLuminance(hex: string, channelScale = 1): number {
  const values = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!values) throw new InvalidContrastColorError(hex)
  const red = linearChannel(hex.slice(1, 3), channelScale)
  const green = linearChannel(hex.slice(3, 5), channelScale)
  const blue = linearChannel(hex.slice(5, 7), channelScale)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/**
 * @description Computes WCAG contrast with the same scale applied to both colors.
 * @param foreground Foreground six-digit sRGB color.
 * @param background Background six-digit sRGB color.
 * @param channelScale Multiplier applied before linearization.
 * @returns Contrast ratio with the lighter color in the numerator.
 */
export function contrastRatio(
  foreground: string,
  background: string,
  channelScale = 1
): number {
  const first = relativeLuminance(foreground, channelScale)
  const second = relativeLuminance(background, channelScale)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

/**
 * @description Computes CIEDE2000 distance between six-digit sRGB colors.
 * @param first First sRGB color.
 * @param second Second sRGB color.
 * @returns Perceptual distance in CIEDE2000 units.
 */
export function ciede2000(first: string, second: string): number {
  return ciede2000Lab(lab(first), lab(second))
}

/**
 * @description Computes CIEDE2000 distance between two CIELab colors.
 * @param first First CIELab color.
 * @param second Second CIELab color.
 * @returns Perceptual distance in CIEDE2000 units.
 */
export function ciede2000Lab(first: Lab, second: Lab): number {
  const [firstL, firstA, firstB] = first
  const [secondL, secondA, secondB] = second
  const terms = ciedeTerms(firstL, firstA, firstB, secondL, secondA, secondB)
  const weights = ciedeWeights(terms)
  const lightness = terms.deltaL / weights.lightness
  const chroma = terms.deltaC / weights.chroma
  const hue = terms.deltaH / weights.hue
  return Math.sqrt(
    lightness ** 2 + chroma ** 2 + hue ** 2 + weights.rotation * chroma * hue
  )
}

function lab(hex: string): Lab {
  const values = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!values) throw new InvalidContrastColorError(hex)
  const red = linearChannel(hex.slice(1, 3), 1)
  const green = linearChannel(hex.slice(3, 5), 1)
  const blue = linearChannel(hex.slice(5, 7), 1)
  const x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047
  const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175
  const z = (red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883
  const transform = (value: number) =>
    value > (6 / 29) ** 3
      ? Math.cbrt(value)
      : value / (3 * (6 / 29) ** 2) + 4 / 29
  return [
    116 * transform(y) - 16,
    500 * (transform(x) - transform(y)),
    200 * (transform(y) - transform(z)),
  ]
}

function ciedeTerms(
  firstL: number,
  firstA: number,
  firstB: number,
  secondL: number,
  secondA: number,
  secondB: number
) {
  const pair = adjustedPair(firstA, firstB, secondA, secondB)
  const hueDelta = deltaHue(pair.firstHue, pair.secondHue)
  return {
    deltaL: secondL - firstL,
    deltaC: pair.secondC - pair.firstC,
    deltaH:
      2 *
      Math.sqrt(pair.firstC * pair.secondC) *
      Math.sin((hueDelta * Math.PI) / 360),
    meanL: (firstL + secondL) / 2,
    meanC: (pair.firstC + pair.secondC) / 2,
    meanH: meanHue(
      pair.firstHue,
      pair.secondHue,
      pair.firstC * pair.secondC === 0
    ),
  }
}

function ciedeWeights(terms: ReturnType<typeof ciedeTerms>) {
  const lightness =
    1 +
    (0.015 * (terms.meanL - 50) ** 2) / Math.sqrt(20 + (terms.meanL - 50) ** 2)
  const chroma = 1 + 0.045 * terms.meanC
  const hue = 1 + 0.015 * terms.meanC * hueFactor(terms.meanH)
  return {
    lightness,
    chroma,
    hue,
    rotation: rotation(terms.meanC, terms.meanH),
  }
}

function adjustedPair(
  firstA: number,
  firstB: number,
  secondA: number,
  secondB: number
) {
  const meanC = (Math.hypot(firstA, firstB) + Math.hypot(secondA, secondB)) / 2
  const adjustment = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)))
  const firstAdjustedA = (1 + adjustment) * firstA
  const secondAdjustedA = (1 + adjustment) * secondA
  return {
    firstC: Math.hypot(firstAdjustedA, firstB),
    secondC: Math.hypot(secondAdjustedA, secondB),
    firstHue: hueAngle(firstAdjustedA, firstB),
    secondHue: hueAngle(secondAdjustedA, secondB),
  }
}

function hueFactor(meanHue: number): number {
  const hueFactor =
    1 -
    0.17 * Math.cos(((meanHue - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * meanHue * Math.PI) / 180) +
    0.32 * Math.cos(((3 * meanHue + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * meanHue - 63) * Math.PI) / 180)
  return hueFactor
}

function rotation(meanC: number, meanHue: number): number {
  return (
    -2 *
    Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)) *
    Math.sin((60 * Math.exp(-(((meanHue - 275) / 25) ** 2)) * Math.PI) / 180)
  )
}

function hueAngle(a: number, b: number): number {
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
}

function deltaHue(first: number, second: number): number {
  if (Math.abs(second - first) <= 180) return second - first
  return second <= first ? second - first + 360 : second - first - 360
}

function meanHue(first: number, second: number, zeroChroma: boolean): number {
  if (zeroChroma) return first + second
  if (Math.abs(first - second) <= 180) return (first + second) / 2
  return first + second < 360
    ? (first + second + 360) / 2
    : (first + second - 360) / 2
}

function linearChannel(value: string, scale: number): number {
  const channel = (Number.parseInt(value, 16) / 255) * scale
  return linearChannelValue(channel)
}

function linearChannelValue(channel: number): number {
  return channel <= SRGB_LINEAR_CUTOFF
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4
}
