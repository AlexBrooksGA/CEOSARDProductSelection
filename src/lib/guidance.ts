/**
 * The version-controlled purpose guidance (data/purpose_guidance.json), validated once.
 * Public, non-secret content shared by server rendering and the browser.
 */
import raw from '../../data/purpose_guidance.json';
import { loadGuidance } from '$lib/domain/purpose';

export const GUIDANCE = loadGuidance(raw);
