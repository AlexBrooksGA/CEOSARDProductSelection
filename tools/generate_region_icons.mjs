/**
 * Generates the small continent maps used by the region choice in the purpose entry
 * (src/lib/components/purpose/region-shapes.json). Development-time only.
 *
 * Map data: Natural Earth 1:110m (public domain) via the `world-atlas` package (ISC).
 * Run in a scratch folder (these packages are not app dependencies):
 *   npm i world-atlas@2.0.2 topojson-client@3.1.0 topojson-simplify@3.0.3 d3-geo@3.1.1 i18n-iso-countries@7.14.0 countries-list@3.1.1
 *   cp /path/to/tools/generate_region_icons.mjs . && node generate_region_icons.mjs /path/to/src/lib/components/purpose/region-shapes.json
 *
 * Russia is split at 60°E (roughly the Urals) between Europe and Asia; Türkiye is shown with Asia.
 */
import fs from 'node:fs';
import * as topojson from 'topojson-client';
import * as simplify from 'topojson-simplify';
import { geoEquirectangular, geoOrthographic, geoPath, geoArea } from 'd3-geo';
import countriesLib from 'i18n-iso-countries';
import { countries } from 'countries-list';
const topo = JSON.parse(fs.readFileSync('./node_modules/world-atlas/countries-110m.json'));
const pre = simplify.presimplify(topo);
const simple = simplify.simplify(pre, simplify.quantile(pre, 0.86));
const W = 120, TOP = 84, BOTTOM = -58;
const H = Math.round((W * (TOP - BOTTOM)) / 360);
const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, (W / 360) * TOP]).clipExtent([[0, 0], [W, H]]);
const x60 = proj([60, 0])[0];
const west = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, (W / 360) * TOP]).clipExtent([[0, 0], [x60, H]]);
const east = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, (W / 360) * TOP]).clipExtent([[x60, 0], [W, H]]);
const geoms = simple.objects.countries.geometries;
const round = (d) => (d ?? '').replace(/-?\d+\.\d+/g, (m) => String(Math.round(+m)));
// Drop polygons smaller than ~0.6 square units at icon scale (tiny islands).
function prune(geometry) {
  if (!geometry) return geometry;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const kept = polys.filter((p) => geoPath(geoEquirectangular().scale(W / (2 * Math.PI))).area({ type: 'Polygon', coordinates: p }) > 1.2);
  return { type: 'MultiPolygon', coordinates: kept };
}
const group = {};
const extra = { 'N. Cyprus': 'AS', Kosovo: 'EU', Somaliland: 'AF' };
for (const g of geoms) {
  const a2 = countriesLib.numericToAlpha2(g.id);
  const cont = a2 === 'RU' ? 'RU' : a2 === 'TR' ? 'AS' : a2 ? countries[a2]?.continent : extra[g.properties.name];
  if (!cont) throw new Error('no continent for ' + g.properties.name);
  (group[cont] ??= []).push(g);
}
const merged = (gs) => prune(topojson.merge(simple, gs));
const p = (geom, pr = proj) => round(geoPath(pr)(geom));
const out = { width: W, height: H, world: p(merged(geoms.filter((g) => countriesLib.numericToAlpha2(g.id) !== 'AQ'))) };
for (const k of ['AF', 'NA', 'SA', 'OC']) out[k] = p(merged(group[k]));
const ru = merged(group.RU);
out.EU = p(merged(group.EU)) + p(ru, west);
out.AS = p(merged(group.AS)) + p(ru, east);
// Antarctica: a small polar disc (south pole view) instead of the cropped world strip.
const R = H / 2 - 1;
const polar = geoOrthographic().rotate([0, 90]).scale(R).translate([W / 2, H / 2]).clipAngle(90);
out.polarDisc = { cx: W / 2, cy: H / 2, r: R };
out.polarLand = p(merged(geoms), polar);
out.AN = p(merged(group.AN), polar);
fs.writeFileSync(process.argv[2] ?? 'region-shapes.json', JSON.stringify(out) + '\n');
