/**
 * Custom star shader for the galaxy renderer, based on the official three.js
 * galaxy example technique (per-point size attenuation with additive blending
 * for a glowing star field). Deterministic: no randomness, no clock; all
 * attributes are supplied by the geometry.
 */

/** Vertex shader: scales each point by its per-vertex size attribute. */
export const STAR_VERTEX_SHADER = `
attribute float size;
attribute float scale;
varying vec3 vColor;

void main() {
  vColor = color;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`

/** Fragment shader: soft circular point with the per-vertex color. */
export const STAR_FRAGMENT_SHADER = `
varying vec3 vColor;

void main() {
  float dist = distance(gl_PointCoord, vec2(0.5));
  float alpha = 1.0 - smoothstep(0.3, 0.7, dist);
  gl_FragColor = vec4(vColor, alpha);
}
`

/** Options for building a star points geometry. */
export interface GalaxyStarOptions {
  /** Per-vertex positions (x, y, z triples). */
  readonly positions: readonly number[]
  /** Per-vertex colors (r, g, b triples). */
  readonly colors: readonly number[]
  /** Per-vertex base sizes. */
  readonly sizes: readonly number[]
}
