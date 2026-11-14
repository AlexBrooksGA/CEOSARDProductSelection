#!/usr/bin/env node
/**
 * Vendor mission images from the CEOS Database API into assets/mission_visuals/, so the explorer
 * serves them itself (its Content Security Policy allows same-origin images only) and works offline.
 *
 *   node tools/fetch_mission_visuals.mjs      (after tools/build_mim_snapshot.mjs)
 *
 * For each mission in data/mim/snapshot.json whose visual is specific to that spacecraft:
 * - the silhouette icon (CEOS MIM original artwork, CC BY 4.0) is always copied;
 * - the picture (photo cut-out, else the colour rendering) is copied only when MIM records a
 *   credit for it. Pictures without a recorded credit are left out until their terms are confirmed.
 * Generic illustrations are never used: they are not the actual spacecraft.
 * Behind a proxy, run with NODE_USE_ENV_PROXY=1 (Node 22.21+).
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'assets/mission_visuals');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function download(api, path, kind) {
	const url = `${api}${path}`;
	for (let attempt = 0; attempt < 4; attempt += 1) {
		let response;
		try {
			response = await fetch(url);
		} catch {
			await sleep(1000 * (attempt + 1));
			continue;
		}
		if (response.status === 429 || response.status >= 500) {
			await sleep(1000 * (attempt + 1));
			continue;
		}
		const declared = Number(response.headers.get('content-length'));
		if (Number.isFinite(declared) && declared > 600_000) throw new Error(`${url}: larger than 600 KB`);
		const type = response.headers.get('content-type') ?? '';
		// The site answers unknown paths with its HTML shell and a 200, so check the type.
		if (!response.ok || !type.startsWith(kind === 'svg' ? 'image/svg+xml' : 'image/png')) throw new Error(`${url}: HTTP ${response.status} ${type}`);
		const body = Buffer.from(await response.arrayBuffer());
		await sleep(120);
		if (kind === 'svg') {
			const text = body.toString('utf8');
			// Inert inside <img>, but the file is also reachable directly on our own origin.
			if (/<script|javascript:|data:text\/html|\son[a-z]+\s*=|<foreignObject|<!ENTITY|<!DOCTYPE|@import|url\(\s*["']?(https?:|\/\/)|href\s*=\s*["']?(https?:|\/\/)/i.test(text)) {
				throw new Error(`${url}: SVG contains script, handlers or external references`);
			}
		} else if (!body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
			throw new Error(`${url}: not a PNG`);
		}
		if (body.length > 600_000) throw new Error(`${url}: larger than 600 KB`);
		return body;
	}
	throw new Error(`${url}: gave up after retries`);
}

async function main() {
	const snapshot = JSON.parse(readFileSync(resolve(ROOT, 'data/mim/snapshot.json'), 'utf8'));
	const api = snapshot.source.api.replace(/\/+$/, '');
	// Download into a temporary folder and swap it in only when everything succeeded.
	const TMP = `${OUT}.tmp`;
	rmSync(TMP, { recursive: true, force: true });
	mkdirSync(TMP, { recursive: true });

	const missions = {};
	for (const mission of Object.values(snapshot.missions)) {
		const visual = mission.visual;
		if (!visual || visual.kind !== 'specific' || !visual.icon) continue;
		const stem = `${mission.mission_id}-${(mission.slug ?? 'mission').replace(/[^a-z0-9-]/gi, '')}`;
		const entry = { acronym: mission.acronym, icon: `${stem}-icon.svg`, image: null, image_credit: null };
		writeFileSync(resolve(TMP, entry.icon), await download(api, visual.icon, 'svg'));
		const picture = visual.photo_512 ?? visual.colour_512;
		if (visual.credit && visual.credit.rights_holder && visual.credit.license && picture) {
			entry.image = `${stem}.png`;
			entry.image_credit = visual.credit;
			writeFileSync(resolve(TMP, entry.image), await download(api, picture, 'png'));
		}
		missions[mission.mission_id] = entry;
	}
	const manifest = {
		schema: 'mission-visuals/1',
		source: `${snapshot.source.attribution} (${snapshot.source.licence.name}), edition ${snapshot.source.edition}`,
		// The API documents the icons as repository-original artwork with no third-party credit; the API's data
		// licence is CC BY 4.0 and MIM credits its other original artwork that way, so CC BY 4.0 is inferred.
		icon_credit: 'Silhouette: CEOS MIM Database, https://database.eohandbook.com (CC BY 4.0)',
		missions
	};
	writeFileSync(resolve(TMP, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
	rmSync(OUT, { recursive: true, force: true });
	renameSync(TMP, OUT);
	const withImage = Object.values(missions).filter((m) => m.image).length;
	console.log(`Vendored ${Object.keys(missions).length} mission icons and ${withImage} credited pictures into assets/mission_visuals/.`);
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
