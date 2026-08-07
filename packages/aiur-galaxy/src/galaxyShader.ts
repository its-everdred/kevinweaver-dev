/**
 * Custom star shader for the galaxy renderer, based on the official three.js
 * galaxy example technique (per-point size attenuation with additive blending
 * for a glowing star field). Deterministic: no randomness, no clock; all
 * attributes are supplied by the geometry.
 */

/**
 * Vertex shader: scales each point by its per-vertex size, dims it by its
 * per-vertex brightness, and hands its softness to the fragment stage. Size,
 * brightness, and softness are what give the field dynamic range; without them
 * every star is the same disc at the same blur and the disc reads as mush.
 */
// Written without indentation or blank lines: the source ships verbatim in the
// client bundle, and the galaxy island has single-digit bytes of headroom
// against its budget.
export const STAR_VERTEX_SHADER = `attribute float size;
attribute float softness;
attribute float brightness;
varying vec3 vColor;
varying float vSoftness;
void main(){
vColor=color*brightness;
vSoftness=softness;
vec4 mv=modelViewMatrix*vec4(position,1.0);
gl_PointSize=size*(300.0/-mv.z);
gl_Position=projectionMatrix*mv;
}`

/**
 * Fragment shader: a circular point whose edge is as hard or as soft as the
 * star's own softness. A softness of 0 holds full alpha almost to the rim and
 * reads as a tight point; a softness of 1 starts falling off at the core and
 * reads as a diffuse smudge. Alpha reaches zero at the inscribed circle, so a
 * point never bleeds into the square corners of its sprite.
 */
export const STAR_FRAGMENT_SHADER = `varying vec3 vColor;
varying float vSoftness;
void main(){
float d=distance(gl_PointCoord,vec2(0.5));
float core=mix(0.42,0.0,clamp(vSoftness,0.0,1.0));
float alpha=1.0-smoothstep(core,0.5,d);
gl_FragColor=vec4(vColor,alpha);
}
`
