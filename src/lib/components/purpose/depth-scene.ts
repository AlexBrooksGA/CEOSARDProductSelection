/**
 * A small WebGL renderer for the purpose-entry background: one landscape image displaced
 * by its depth map as the pointer moves (a "3D photo" effect), crossfading between the
 * illustrative looks and pixelating for "broad patterns". Browser-only; no dependencies.
 *
 * Callers fall back to a still image whenever `DepthScene.create` returns null, a texture
 * fails to load or the context is lost.
 */

export type SceneLook = 'optical' | 'radar' | 'thermal';
export interface SceneState {
	look: SceneLook;
	/** No single measurement chosen: a navy/teal duotone of the optical look. */
	neutral: boolean;
	/** "Broad patterns": the scene is shown as coarse blocks (illustrative, not calibrated). */
	coarse: boolean;
}

export const IMAGE_BASE = '/images/purpose-journey';
export const LANDSCAPE_WIDTHS = [1280, 1920, 2560] as const;
/** Coarse blocks across the image width (matches the 160 × 90 still fallback). */
export const COARSE_COLUMNS = 160;
const IMAGE_ASPECT = 16 / 9;
/** Extra zoom so displaced edges never reveal the frame. */
const ZOOM = 1.07;
/** Where the subject sits horizontally, for narrow windows that crop the sides. */
const FOCUS_X = 0.64;
const FADE_MS = 520;

/** Smallest landscape width that covers the screen width in device pixels, else the largest (as srcset does). */
export function pickWidth(deviceWidth: number): number {
	return LANDSCAPE_WIDTHS.find((width) => width >= deviceWidth * 0.9) ?? LANDSCAPE_WIDTHS.at(-1)!;
}

/** Cover-fit of a 16:9 image in a box: UV scale and focus, keeping the focus inside the image. */
export function coverTransform(width: number, height: number): { scale: [number, number]; focus: [number, number] } {
	const aspect = width / Math.max(1, height);
	const scale: [number, number] = aspect > IMAGE_ASPECT ? [1 / ZOOM, IMAGE_ASPECT / aspect / ZOOM] : [aspect / IMAGE_ASPECT / ZOOM, 1 / ZOOM];
	const clamp = (value: number, half: number) => Math.min(1 - half, Math.max(half, value));
	return { scale, focus: [clamp(FOCUS_X, scale[0] / 2), 0.5] };
}

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
	vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
	gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform sampler2D uDepth;
uniform float uMix;
uniform vec2 uPointer;
uniform float uScroll;
uniform vec2 uScale;
uniform vec2 uFocus;
uniform vec2 uPixelFrom;
uniform vec2 uPixelTo;
uniform float uNeutralFrom;
uniform float uNeutralTo;
varying vec2 vUv;

vec3 duotone(vec3 c) {
	float l = dot(c, vec3(0.299, 0.587, 0.114));
	return mix(vec3(0.03, 0.07, 0.11), vec3(0.42, 0.74, 0.72), smoothstep(0.05, 0.85, l));
}
vec3 look(sampler2D tex, vec2 uv, vec2 pixel, float neutral) {
	vec2 p = pixel.x > 0.0 ? (floor(uv * pixel) + 0.5) / pixel : uv;
	vec3 c = texture2D(tex, p).rgb;
	return neutral > 0.5 ? duotone(c) : c;
}
void main() {
	vec2 uv = (vUv - 0.5) * uScale + uFocus;
	float d = texture2D(uDepth, uv).r;
	// Near (light) parts move further than far (dark) parts; a little scroll adds depth too.
	uv += uPointer * (d - 0.5) * vec2(0.022, 0.016) + vec2(0.0, uScroll * (d - 0.4) * 0.028);
	vec3 a = look(uFrom, uv, uPixelFrom, uNeutralFrom);
	vec3 b = look(uTo, uv, uPixelTo, uNeutralTo);
	gl_FragColor = vec4(mix(a, b, uMix), 1.0);
}`;

interface Layer {
	look: SceneLook;
	neutral: boolean;
	coarse: boolean;
}

export class DepthScene {
	private readonly gl: WebGLRenderingContext;
	private readonly program: WebGLProgram;
	private readonly uniforms: Record<string, WebGLUniformLocation | null> = {};
	private readonly textures = new Map<SceneLook, Promise<WebGLTexture>>();
	private readonly ready = new Map<SceneLook, WebGLTexture>();
	private depth: WebGLTexture | null = null;
	private from: Layer | null = null;
	private to: Layer | null = null;
	private fadeStart = 0;
	private fadeMs = FADE_MS;
	private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
	private scroll = { v: 0, t: 0 };
	private frame = 0;
	private size = { width: 1, height: 1 };
	private textureWidth: number = LANDSCAPE_WIDTHS[1];
	private destroyed = false;
	private generation = 0;
	/** Called once if the context is lost or a texture fails; the caller shows the still image. */
	onfail: (reason: string) => void = () => {};

	private constructor(
		private readonly canvas: HTMLCanvasElement,
		gl: WebGLRenderingContext
	) {
		this.gl = gl;
		this.program = this.link();
		gl.useProgram(this.program);
		for (const name of ['uFrom', 'uTo', 'uDepth', 'uMix', 'uPointer', 'uScroll', 'uScale', 'uFocus', 'uPixelFrom', 'uPixelTo', 'uNeutralFrom', 'uNeutralTo']) {
			this.uniforms[name] = gl.getUniformLocation(this.program, name);
		}
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
		const position = gl.getAttribLocation(this.program, 'aPos');
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		gl.uniform1i(this.uniforms.uFrom!, 0);
		gl.uniform1i(this.uniforms.uTo!, 1);
		gl.uniform1i(this.uniforms.uDepth!, 2);
		canvas.addEventListener('webglcontextlost', this.lost);
	}

	/** Null when WebGL is unavailable (the caller keeps the still image). */
	static create(canvas: HTMLCanvasElement): DepthScene | null {
		try {
			const options: WebGLContextAttributes = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true };
			const gl = (canvas.getContext('webgl2', options) ?? canvas.getContext('webgl', options)) as WebGLRenderingContext | null;
			return gl ? new DepthScene(canvas, gl) : null;
		} catch {
			return null;
		}
	}

	/** Load the depth map and the first look; resolves once the first frame is drawn. */
	async start(state: SceneState, deviceWidth: number): Promise<void> {
		this.textureWidth = pickWidth(deviceWidth);
		const [depth] = await Promise.all([this.loadTexture(`${IMAGE_BASE}/depth.webp`, false), this.texture(state.look)]);
		if (this.destroyed) return;
		this.depth = depth;
		this.from = this.to = { ...state };
		this.fadeStart = 0;
		this.draw(performance.now());
	}

	/** Crossfade to a new look or detail; textures load on first use. */
	async show(state: SceneState, animate: boolean): Promise<void> {
		const next: Layer = { ...state };
		const current = this.to;
		if (current && current.look === next.look && current.neutral === next.neutral && current.coarse === next.coarse) return;
		const generation = ++this.generation;
		try {
			await this.texture(next.look);
		} catch (error) {
			this.fail(error instanceof Error ? error.message : 'texture');
			return;
		}
		if (this.destroyed || generation !== this.generation) return;
		this.from = this.mixedLayer();
		this.to = next;
		this.fadeMs = animate ? FADE_MS : 0;
		this.fadeStart = performance.now();
		this.kick();
	}

	setPointer(x: number, y: number): void {
		this.pointer.tx = x;
		this.pointer.ty = y;
		this.kick();
	}

	setScroll(value: number): void {
		this.scroll.t = value;
		this.kick();
	}

	resize(cssWidth: number, cssHeight: number, dpr: number): void {
		// The masters hold about 1700 px of real detail, so a modest buffer loses nothing visible
		// and keeps the per-frame cost low on integrated graphics.
		const ratio = Math.min(dpr, 1.25);
		const width = Math.max(1, Math.round(cssWidth * ratio));
		const height = Math.max(1, Math.round(cssHeight * ratio));
		if (width === this.size.width && height === this.size.height) return;
		this.size = { width, height };
		this.canvas.width = width;
		this.canvas.height = height;
		this.gl.viewport(0, 0, width, height);
		this.kick();
	}

	destroy(): void {
		this.destroyed = true;
		cancelAnimationFrame(this.frame);
		this.canvas.removeEventListener('webglcontextlost', this.lost);
		this.gl.getExtension('WEBGL_lose_context')?.loseContext();
	}

	// ------------------------------------------------------------------ internals

	private lost = (event: Event) => {
		event.preventDefault();
		this.fail('context lost');
	};

	private fail(reason: string) {
		if (this.destroyed) return;
		this.destroy();
		this.onfail(reason);
	}

	/** The layer currently on screen when a fade is interrupted (snap to the nearer one). */
	private mixedLayer(): Layer | null {
		if (!this.from || !this.to) return this.to;
		return this.fadeProgress(performance.now()) < 0.5 ? this.from : this.to;
	}

	private fadeProgress(now: number): number {
		if (!this.fadeStart || this.fadeMs === 0) return 1;
		const t = Math.min(1, (now - this.fadeStart) / this.fadeMs);
		return t * t * (3 - 2 * t);
	}

	private kick() {
		if (!this.frame && !this.destroyed && this.depth) this.frame = requestAnimationFrame(this.tick);
	}

	private tick = (now: number) => {
		this.frame = 0;
		const p = this.pointer;
		p.x += (p.tx - p.x) * 0.07;
		p.y += (p.ty - p.y) * 0.07;
		this.scroll.v += (this.scroll.t - this.scroll.v) * 0.12;
		this.draw(now);
		const moving = Math.abs(p.tx - p.x) + Math.abs(p.ty - p.y) + Math.abs(this.scroll.t - this.scroll.v) > 0.0008;
		if (moving || this.fadeProgress(now) < 1) this.kick();
	};

	private draw(now: number) {
		const { gl } = this;
		if (!this.depth || !this.from || !this.to) return;
		const a = this.ready.get(this.from.look);
		const b = this.ready.get(this.to.look);
		if (!a || !b) return;
		const { scale, focus } = coverTransform(this.size.width, this.size.height);
		const coarse = (layer: Layer): [number, number] => (layer.coarse ? [COARSE_COLUMNS, Math.round(COARSE_COLUMNS / IMAGE_ASPECT)] : [0, 0]);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, a);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, b);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, this.depth);
		gl.uniform1f(this.uniforms.uMix!, this.fadeProgress(now));
		gl.uniform2f(this.uniforms.uPointer!, this.pointer.x, this.pointer.y);
		gl.uniform1f(this.uniforms.uScroll!, this.scroll.v);
		gl.uniform2f(this.uniforms.uScale!, scale[0], scale[1]);
		gl.uniform2f(this.uniforms.uFocus!, focus[0], focus[1]);
		gl.uniform2f(this.uniforms.uPixelFrom!, ...coarse(this.from));
		gl.uniform2f(this.uniforms.uPixelTo!, ...coarse(this.to));
		gl.uniform1f(this.uniforms.uNeutralFrom!, this.from.neutral ? 1 : 0);
		gl.uniform1f(this.uniforms.uNeutralTo!, this.to.neutral ? 1 : 0);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}

	private texture(look: SceneLook): Promise<WebGLTexture> {
		let texture = this.textures.get(look);
		if (!texture) {
			texture = this.loadTexture(`${IMAGE_BASE}/${look}-${this.textureWidth}.webp`, true);
			texture.then(
				(loaded) => this.ready.set(look, loaded),
				() => this.textures.delete(look)
			);
			this.textures.set(look, texture);
		}
		return texture;
	}

	private async loadTexture(url: string, mipmaps: boolean): Promise<WebGLTexture> {
		const image = new Image();
		image.decoding = 'async';
		image.src = url;
		await image.decode();
		if (this.destroyed) throw new Error('destroyed');
		const { gl } = this;
		const texture = gl.createTexture();
		if (!texture) throw new Error('texture');
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		// Mipmaps need WebGL 2 for non-power-of-two sizes; WebGL 1 uses plain linear filtering.
		const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
		if (mipmaps && webgl2) {
			gl.generateMipmap(gl.TEXTURE_2D);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		} else {
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		}
		return texture;
	}

	private link(): WebGLProgram {
		const { gl } = this;
		const compile = (type: number, source: string) => {
			const shader = gl.createShader(type)!;
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
			return shader;
		};
		const program = gl.createProgram()!;
		gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
		gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
		return program;
	}
}
