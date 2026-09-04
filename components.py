"""Reusable Streamlit presentation components."""

from __future__ import annotations

import base64
from functools import lru_cache
from html import escape
import json
from pathlib import Path
import re

import streamlit as st

from fedeo_ui import render_fedeo_metadata
from matching import MatchResult, add_comparison
from models import Product, Profile


NOT_REPORTED = "Not reported"
AGENCY_LOGO_DIR = Path(__file__).with_name("assets") / "agency_logos"

CATEGORY_VISUALS: dict[str, tuple[str, str, str]] = {
    "Surface Reflectance": ("surface-reflectance", "SR", "Surface Reflectance"),
    "Surface Temperature": ("surface-temperature", "ST", "Surface Temperature"),
    "Synthetic Aperture Radar": ("synthetic-aperture-radar", "SAR", "Synthetic Aperture Radar"),
    "Aquatic Reflectance": ("aquatic-reflectance", "AR", "Aquatic Reflectance"),
    "Night-time Lights": ("night-time-lights", "NTL", "Nighttime Lights Surface Radiance"),
}


def category_visual(product_family: str | None) -> tuple[str, str, str]:
    """Return the shared visual identity for a product category."""
    return CATEGORY_VISUALS.get(product_family or "", ("other", "EO", product_family or "Other Earth observation"))


def inject_theme() -> None:
    st.markdown(
        """
        <style>
        :root {
          --ceos-canvas: #F5F2EB;
          --ceos-surface: #FFFFFF;
          --ceos-surface-warm: #FBF8F1;
          --ceos-surface-cool: #F1F7F8;
          --ceos-surface-muted: #F7F6F2;
          --ceos-ink: #172B3A;
          --ceos-navy: #17364A;
          --ceos-primary: #256C86;
          --ceos-primary-dark: #1D566C;
          --ceos-primary-soft: #E6F1F4;
          --ceos-green: #2E6F4E;
          --ceos-green-soft: #E8F3EC;
          --ceos-amber: #94631A;
          --ceos-amber-soft: #FBF1DA;
          --ceos-muted: #5F6B74;
          --ceos-subtle: #647078;
          --ceos-border: #D6DEE1;
          --ceos-border-strong: #BCC9CE;
          --ceos-focus: rgba(37, 108, 134, .28);
          --ceos-radius-sm: 8px;
          --ceos-radius-md: 12px;
          --ceos-radius-lg: 16px;
          --ceos-shadow-sm: 0 2px 8px rgba(23, 54, 74, .055);
          --ceos-shadow-md: 0 8px 24px rgba(23, 54, 74, .075);
          --cat-sr: #4B704F;
          --cat-sr-soft: #EDF4EE;
          --cat-st: #934F34;
          --cat-st-soft: #F8EEE9;
          --cat-sar: #596C91;
          --cat-sar-soft: #EEF1F7;
          --cat-ar: #246E78;
          --cat-ar-soft: #E8F4F5;
          --cat-ntl: #74658D;
          --cat-ntl-soft: #F1EEF6;
          --cat-other: #5E6971;
          --cat-other-soft: #F0F2F3;
        }

        html, body, [class*="css"] { color: var(--ceos-ink); }
        .stApp { background: var(--ceos-canvas); color: var(--ceos-ink); }
        [data-testid="stHeader"] { height: 3rem; background: rgba(245, 242, 235, .95); }
        [data-testid="stSidebar"] { background: var(--ceos-surface-warm); }
        .block-container {
          width: min(94%, 1800px); max-width: 1800px;
          padding-top: 3.25rem; padding-bottom: 3.5rem;
        }

        h1, h2, h3, h4, h5, h6 {
          color: var(--ceos-navy) !important; letter-spacing: -.022em; text-wrap: balance;
        }
        p, label, .stCaption { color: var(--ceos-ink); }
        [data-testid="stCaptionContainer"] p { color: var(--ceos-muted) !important; font-size: .84rem; line-height: 1.45; }
        a { color: var(--ceos-primary) !important; text-underline-offset: 2px; }

        .hero {
          position: relative; overflow: hidden;
          padding: 1.05rem 1.35rem 1.08rem 1.55rem;
          border: 1px solid #24495E;
          border-left: 6px solid #63A6AC;
          border-radius: var(--ceos-radius-lg);
          background: var(--ceos-navy);
          margin-bottom: .9rem;
          box-shadow: var(--ceos-shadow-md);
        }
        .hero-kicker { color: #BFDCE2; font-size: .68rem; font-weight: 760; letter-spacing: .12em; text-transform: uppercase; }
        .hero h1 { margin: .16rem 0 0; font-size: 1.78rem; line-height: 1.16; color: white !important; }
        .prototype {
          display: inline-flex; align-items: center; margin-left: .55rem; padding: .13rem .48rem;
          border-radius: 999px; color: #E3F2F4; border: 1px solid #79AEB5;
          font-size: .61rem; font-weight: 760; letter-spacing: .08em; vertical-align: .1rem;
        }
        .disclaimer { color: #D5E2E7; font-size: .8rem; line-height: 1.45; margin-top: .42rem; max-width: 1050px; }

        .page-heading { margin: 1.4rem 0 1rem; max-width: 980px; }
        .page-eyebrow { color: var(--ceos-primary); font-size: .7rem; font-weight: 780; letter-spacing: .11em; text-transform: uppercase; }
        .page-title { color: var(--ceos-navy); font-size: 1.72rem; font-weight: 790; line-height: 1.15; margin-top: .18rem; letter-spacing: -.025em; }
        .page-description { color: var(--ceos-muted); font-size: .92rem; line-height: 1.5; margin-top: .35rem; }

        [data-testid="stTabs"] [role="tablist"] {
          gap: .22rem; width: fit-content; padding: .28rem;
          background: rgba(255,255,255,.62); border: 1px solid #D9DEDC; border-radius: 11px;
        }
        [data-testid="stTabs"] [data-testid="stTab"] {
          min-height: 2.35rem; color: var(--ceos-muted); font-weight: 680; padding: .5rem 1rem;
          border-radius: 8px;
        }
        [data-testid="stTabs"] [data-testid="stTab"][aria-selected="true"] {
          color: var(--ceos-primary-dark); background: var(--ceos-surface);
          box-shadow: 0 1px 5px rgba(23,54,74,.10);
        }
        [data-testid="stTabs"] [data-testid="stTab"]:focus-visible {
          outline: 3px solid var(--ceos-focus); outline-offset: 2px;
        }
        [data-testid="stTabs"] .react-aria-SelectionIndicator { display: none; }

        .panel-marker, .builder-panel-marker, .product-card-marker, .compare-card-marker { height: 0; overflow: hidden; }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .panel-profile) {
          background: var(--ceos-surface-warm); border-color: #DDD6C8 !important; box-shadow: var(--ceos-shadow-sm);
        }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .panel-filters) {
          background: var(--ceos-surface-cool); border-color: #C9DDE1 !important; box-shadow: 0 3px 14px rgba(37,108,134,.06);
        }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .panel-results) {
          background: rgba(255,255,255,.74); border-color: #D6DCDA !important; box-shadow: none;
        }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .panel-compare-intro) {
          background: var(--ceos-primary-soft); border-color: #CADDE3 !important; box-shadow: none;
        }
        [data-testid="stForm"] {
          background: transparent; border: 0; padding: 0; box-shadow: none;
        }
        [data-testid="stForm"] [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .builder-panel-marker),
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .builder-panel-marker) {
          background: var(--ceos-surface); border-color: var(--ceos-border) !important;
          box-shadow: var(--ceos-shadow-sm); border-left: 4px solid #8FB7C0 !important;
        }

        .stage-heading { display: flex; align-items: flex-start; gap: .72rem; margin: 0 0 .9rem; }
        .stage-number {
          display: inline-grid; place-items: center; flex: 0 0 1.82rem; height: 1.82rem;
          color: white; background: var(--ceos-primary); border-radius: 7px; font-size: .78rem; font-weight: 780;
        }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .panel-profile) .stage-number { background: #7A6C51; }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .panel-results) .stage-number { background: var(--ceos-navy); }
        .stage-title { color: var(--ceos-navy); font-size: 1.05rem; line-height: 1.25; font-weight: 780; }
        .stage-description { color: var(--ceos-muted); font-size: .81rem; line-height: 1.4; margin-top: .1rem; }
        .subsection-title { color: var(--ceos-navy); font-size: .9rem; font-weight: 780; margin: .15rem 0 .2rem; }
        .subsection-copy { color: var(--ceos-muted); font-size: .79rem; line-height: 1.4; margin-bottom: .62rem; }

        [data-testid="stAlert"] { border-radius: 10px; border-width: 1px; box-shadow: none; }
        [data-testid="stAlert"]:has([data-testid="stNotificationContentInfo"]) { background: #EAF3F6; border-color: #C8DDE4; }
        [data-testid="stExpander"] {
          background: rgba(255,255,255,.72); border-color: var(--ceos-border); border-radius: 9px;
        }
        [data-testid="stExpander"] summary { font-weight: 650; }
        [data-testid="stExpander"] summary:hover { background: var(--ceos-primary-soft); }
        [data-testid="stExpander"] summary:focus-visible { outline: 3px solid var(--ceos-focus); outline-offset: 2px; }

        [data-baseweb="select"] > div,
        [data-baseweb="input"],
        [data-baseweb="textarea"],
        [data-testid="stTextInput"] input,
        [data-testid="stTextArea"] textarea,
        [data-testid="stNumberInput"] input {
          background: #FFFFFF !important; border: 1px solid #C6D1D5 !important;
          border-radius: var(--ceos-radius-sm) !important; color: var(--ceos-ink) !important;
        }
        [data-baseweb="input"], [data-baseweb="textarea"] {
          border: 1px solid #C6D1D5 !important; border-radius: var(--ceos-radius-sm) !important;
        }
        [data-baseweb="select"] > div:hover,
        [data-testid="stTextInput"] input:hover,
        [data-testid="stTextArea"] textarea:hover,
        [data-testid="stNumberInput"] input:hover { border-color: #76A4B2 !important; }
        input:focus, textarea:focus, [data-baseweb="select"] > div:focus-within {
          box-shadow: 0 0 0 3px var(--ceos-focus) !important;
        }
        [data-testid="stCheckbox"] { margin-bottom: .15rem; }
        input:disabled, textarea:disabled, button:disabled { cursor: not-allowed !important; opacity: .62; }

        .precision-slider-marker { height: 0; overflow: hidden; }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .precision-slider-marker) {
          gap: .35rem; padding: .62rem .68rem .5rem; margin-top: .22rem;
          background: rgba(255,255,255,.58); border-radius: 10px;
          box-shadow: inset 0 0 0 1px rgba(169,190,197,.5);
        }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .precision-slider-marker) [data-testid="stSlider"] label p {
          color: var(--ceos-navy); font-size: .78rem; font-weight: 730;
        }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .precision-slider-marker) [data-testid="stNumberInput"] label p {
          color: var(--ceos-muted); font-size: .68rem; font-weight: 680;
        }
        [data-testid="stSlider"] [role="slider"] {
          background: var(--ceos-primary) !important; border: 2px solid #FFFFFF !important;
          box-shadow: 0 0 0 1px var(--ceos-primary), 0 2px 6px rgba(23,54,74,.16) !important;
        }
        [data-testid="stSlider"] [role="slider"]:focus-visible {
          outline: 3px solid var(--ceos-focus) !important; outline-offset: 3px;
        }

        .stButton > button, .stFormSubmitButton > button, .stLinkButton > a {
          border-radius: 9px; border-color: #9EB2B9; color: var(--ceos-navy); background: rgba(255,255,255,.8);
          font-weight: 650; transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
        }
        .stButton > button:hover, .stLinkButton > a:hover {
          color: var(--ceos-primary-dark); border-color: var(--ceos-primary); background: var(--ceos-primary-soft);
          box-shadow: 0 2px 7px rgba(37,108,134,.10);
        }
        button[kind="primary"], .stFormSubmitButton > button[kind="primary"] {
          color: white !important; background: var(--ceos-primary) !important; border-color: var(--ceos-primary) !important;
        }
        button[kind="primary"]:hover, .stFormSubmitButton > button[kind="primary"]:hover { background: var(--ceos-primary-dark) !important; }
        button:focus-visible, a:focus-visible { outline: 3px solid var(--ceos-focus) !important; outline-offset: 2px; }
        [data-testid="stSpinner"] { color: var(--ceos-primary); }

        .summary-strip {
          display: grid; grid-template-columns: auto 1fr; gap: .45rem .7rem; align-items: center;
          padding: .7rem .78rem; border: 0; background: var(--ceos-surface-muted);
          border-radius: 10px; margin: .25rem 0 .75rem;
        }
        .summary-label { color: var(--ceos-muted); font-size: .65rem; font-weight: 780; letter-spacing: .08em; text-transform: uppercase; }
        .summary-chips { display: flex; gap: .38rem; flex-wrap: wrap; }
        .summary-chip {
          color: #43535E; background: #FFFFFF; border: 1px solid #D4DDDF;
          border-radius: 999px; padding: .22rem .55rem; font-size: .73rem; font-weight: 650;
        }
        .summary-chip.is-refined { color: var(--ceos-primary-dark); background: var(--ceos-primary-soft); border-color: #BDD7DE; }
        .result-heading {
          display: flex; align-items: baseline; justify-content: space-between; gap: 1rem;
          color: var(--ceos-navy); font-size: 1.15rem; font-weight: 790;
          line-height: 1.25; margin: 1.45rem 0 .62rem; padding: 0 0 .48rem;
          border-bottom: 1px solid #D7DDDC;
        }
        .result-count { color: var(--ceos-muted); font-size: .72rem; font-weight: 690; letter-spacing: .02em; }

        .category-cue { display: flex; align-items: center; gap: .55rem; margin: -.18rem 0 .45rem; color: var(--category-color); }
        .category-cue-copy { color: var(--ceos-muted); font-size: .73rem; line-height: 1.25; }
        .category-cue-copy strong { display: block; color: var(--ceos-navy); font-size: .76rem; }
        .category-identity { display: inline-flex; align-items: center; gap: .42rem; color: var(--category-color); font-size: .7rem; font-weight: 780; letter-spacing: .035em; text-transform: uppercase; }
        .category-icon { display: inline-grid; place-items: center; min-width: 1.8rem; height: 1.55rem; padding: 0 .3rem; border-radius: 6px; color: var(--category-color); background: var(--category-soft); border: 1px solid color-mix(in srgb, var(--category-color) 28%, white); font-size: .62rem; font-weight: 820; letter-spacing: .02em; }
        .category-surface-reflectance { --category-color: var(--cat-sr); --category-soft: var(--cat-sr-soft); }
        .category-surface-temperature { --category-color: var(--cat-st); --category-soft: var(--cat-st-soft); }
        .category-synthetic-aperture-radar { --category-color: var(--cat-sar); --category-soft: var(--cat-sar-soft); }
        .category-aquatic-reflectance { --category-color: var(--cat-ar); --category-soft: var(--cat-ar-soft); }
        .category-night-time-lights { --category-color: var(--cat-ntl); --category-soft: var(--cat-ntl-soft); }
        .category-other { --category-color: var(--cat-other); --category-soft: var(--cat-other-soft); }

        .profile-card-marker { height: 0; overflow: hidden; }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .profile-card-marker) {
          display: flex; flex-direction: column; height: 100%; min-height: 10rem;
          padding: .72rem .8rem .62rem; background: var(--ceos-surface);
          border-color: #D7D6D0 !important; border-left: 3px solid #B5AA92 !important;
          box-shadow: var(--ceos-shadow-sm);
        }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .profile-card-marker.is-selected) {
          border-color: var(--ceos-primary) !important; border-left-color: var(--ceos-primary) !important;
          box-shadow: 0 0 0 2px rgba(37,108,134,.12), var(--ceos-shadow-sm);
        }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .profile-create-marker) {
          background: #F5F5F2; border: 1px dashed #B9C0C0 !important; box-shadow: none;
        }
        .profile-card-kind { color: var(--ceos-subtle); font-size: .61rem; font-weight: 760; letter-spacing: .07em; text-transform: uppercase; margin-bottom: .24rem; }
        .profile-card-title { color: var(--ceos-navy); font-size: .94rem; font-weight: 790; line-height: 1.22; text-wrap: balance; }
        .profile-card-description { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; color: var(--ceos-muted); font-size: .72rem; line-height: 1.35; min-height: 1.95rem; margin-top: .22rem; }
        .profile-card-summary { display: inline-flex; width: fit-content; margin-top: .45rem; padding: .25rem .46rem; color: #40515B; background: #F1F5F5; border: 1px solid #D7E0E1; border-radius: 6px; font-size: .65rem; font-weight: 690; line-height: 1.25; }
        .profile-card-status { color: var(--ceos-primary-dark); font-size: .64rem; font-weight: 730; margin-top: .42rem; }
        .profile-create-icon { display: grid; place-items: center; width: 1.75rem; height: 1.75rem; margin-bottom: .45rem; border-radius: 50%; color: #687277; background: #E5E7E5; font-size: 1.15rem; font-weight: 500; }
        .profile-carousel-meta { color: var(--ceos-muted); font-size: .7rem; text-align: right; padding-top: .4rem; }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .profile-card-marker) [data-testid="stButton"] { margin-top: auto; padding-top: .35rem; }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .profile-card-marker) [data-testid="stButton"] button { min-height: 1.9rem; padding: .25rem .65rem; font-size: .7rem; }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .profile-create-marker) [data-testid="stButton"] button {
          color: #5F696D; background: #ECEEEC; border-color: #BBC2C1; box-shadow: none;
        }

        .badge-row { display: flex; flex-wrap: wrap; gap: .28rem; margin: .55rem 0 .15rem; }
        .badge { display: inline-flex; align-items: center; min-height: 1.42rem; padding: .18rem .48rem; border-radius: 999px; font-size: .65rem; line-height: 1; font-weight: 730; white-space: nowrap; }
        .badge-icon { margin-right: .23rem; font-size: .65rem; }
        .badge-verified { color: #FFFFFF; background: var(--ceos-green); border: 1px solid var(--ceos-green); }
        .badge-progress { color: #744A08; background: var(--ceos-amber-soft); border: 1px solid #D6B36F; }
        .badge-neutral { color: #4E5B64; background: #EEF1F2; border: 1px solid #D1D9DC; }
        .badge-resource { color: #475A67; background: #F7F8F8; border: 1px solid #D6DDDF; }
        .badge-version { color: var(--ceos-primary-dark); background: var(--ceos-primary-soft); border: 1px solid #C2D9DF; }

        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker) {
          --category-color: var(--cat-other); --category-soft: var(--cat-other-soft);
          position: relative; container-type: inline-size; min-height: 27rem;
          background: var(--ceos-surface); border-color: #D2DADC !important;
          border-top: 4px solid var(--category-color) !important;
          box-shadow: var(--ceos-shadow-sm); transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
        }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker.category-surface-reflectance) { --category-color: var(--cat-sr); --category-soft: var(--cat-sr-soft); }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker.category-surface-temperature) { --category-color: var(--cat-st); --category-soft: var(--cat-st-soft); }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker.category-synthetic-aperture-radar) { --category-color: var(--cat-sar); --category-soft: var(--cat-sar-soft); }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker.category-aquatic-reflectance) { --category-color: var(--cat-ar); --category-soft: var(--cat-ar-soft); }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker.category-night-time-lights) { --category-color: var(--cat-ntl); --category-soft: var(--cat-ntl-soft); }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker):hover {
          border-color: #AFC2C7 !important; border-top-color: var(--category-color) !important;
          box-shadow: var(--ceos-shadow-md); transform: translateY(-1px);
        }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker.is-selected) {
          border-color: var(--ceos-primary) !important; border-top-color: var(--category-color) !important;
          box-shadow: 0 0 0 2px rgba(37,108,134,.13), var(--ceos-shadow-md);
        }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker) {
          display: flex; flex-direction: column; height: 100%; padding: .92rem 1rem .85rem;
        }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker) [data-testid="stExpander"] {
          background: var(--ceos-surface-muted); box-shadow: none; border-color: #D6DEDF;
        }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker) [data-testid="stExpander"] > details > div { background: var(--ceos-surface-muted); }
        .product-header { padding-bottom: .55rem; border-bottom: 1px solid #E1E6E7; }
        .product-topline { display: flex; align-items: flex-start; justify-content: space-between; gap: .7rem; min-height: 2.55rem; }
        .agency-mark {
          display: grid; place-items: center; flex: 0 0 5rem; width: 5rem; height: 2.55rem;
          padding: .28rem .4rem; background: #FFFFFF; border: 1px solid #DDE4E6;
          border-radius: 8px; box-shadow: 0 1px 4px rgba(23,54,74,.045);
        }
        .agency-mark img { display: block; width: 100%; height: 100%; object-fit: contain; }
        .agency-mark-monochrome-dark img { filter: brightness(0) saturate(100%); }
        .agency-mark-fallback {
          color: var(--ceos-primary-dark); background: #EEF5F6; border-color: #C9DDE1;
          font-size: .65rem; font-weight: 820; letter-spacing: .055em;
        }
        .product-title {
          color: var(--ceos-navy); font-size: 1.03rem; font-weight: 790; line-height: 1.28;
          margin-top: .44rem; overflow-wrap: anywhere; text-wrap: balance;
        }
        .product-agency { color: var(--ceos-ink); font-size: .77rem; font-weight: 690; line-height: 1.35; margin-top: .32rem; }
        .product-agency-label { color: var(--ceos-muted); font-size: .62rem; font-weight: 760; letter-spacing: .05em; text-transform: uppercase; margin-right: .3rem; }
        .mission-instrument { display: grid; grid-template-columns: 1fr 1fr; gap: .42rem; margin-top: .5rem; }
        .identity-item { min-width: 0; }
        .identity-label { display: block; color: var(--ceos-subtle); font-size: .59rem; font-weight: 750; letter-spacing: .045em; text-transform: uppercase; }
        .identity-value { display: block; color: #465661; font-size: .72rem; line-height: 1.32; margin-top: .08rem; overflow-wrap: anywhere; }
        .metric-row { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: .38rem; margin: .62rem 0 .55rem; }
        .mini-metric { min-width: 0; padding: .48rem .45rem; border-radius: 8px; background: var(--category-soft); border: 0; }
        .mini-label { color: #687680; font-size: .56rem; line-height: 1.2; font-weight: 760; text-transform: uppercase; letter-spacing: .035em; }
        .mini-value { color: var(--ceos-navy); font-size: .73rem; font-weight: 700; line-height: 1.28; margin-top: .18rem; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .criterion { color: #3C4B55; font-size: .76rem; line-height: 1.42; padding: .48rem .55rem; background: #F7F8F7; border-left: 3px solid #C6D2D5; border-radius: 0 6px 6px 0; }
        .instrument-resolution {
          color: #40545E; font-size: .69rem; line-height: 1.38; margin: -.12rem 0 .55rem;
          padding: .38rem .48rem; background: #EEF6F7; border-left: 3px solid var(--ceos-primary); border-radius: 0 6px 6px 0;
        }
        .instrument-resolution strong { color: var(--ceos-primary-dark); }
        .instrument-resolution .fallback-note { display: block; color: #6A5734; margin-top: .14rem; }
        .support-line { display: flex; flex-wrap: wrap; gap: .25rem .8rem; color: var(--ceos-muted); font-size: .69rem; line-height: 1.35; margin-top: .5rem; }
        .support-label { color: var(--ceos-subtle); font-weight: 720; }
        .record-source { color: var(--ceos-subtle); font-size: .65rem; margin-top: .42rem; }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker) [data-testid="stButton"] {
          margin-top: auto; padding-top: .65rem; border-top: 1px solid #E0E5E6;
        }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker) [data-testid="stButton"] button { border-color: #8DAAB4; color: var(--ceos-primary-dark); }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker.is-selected) [data-testid="stButton"] button { background: var(--ceos-primary-soft); color: var(--ceos-primary-dark); }

        .empty-state { padding: 1.5rem; text-align: center; background: rgba(255,255,255,.68); border: 1px dashed #BFCBCD; border-radius: var(--ceos-radius-md); }
        .empty-state-icon { display: inline-grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: 10px; color: var(--ceos-primary-dark); background: var(--ceos-primary-soft); font-size: .72rem; font-weight: 820; }
        .empty-state-title { color: var(--ceos-navy); font-size: .96rem; font-weight: 760; margin-top: .55rem; }
        .empty-state-copy { color: var(--ceos-muted); font-size: .8rem; line-height: 1.45; margin-top: .2rem; }

        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .compare-card-marker) { --category-color: var(--cat-other); height: 100%; background: var(--ceos-surface); box-shadow: var(--ceos-shadow-sm); }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .compare-card-marker.category-surface-reflectance) { --category-color: var(--cat-sr); }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .compare-card-marker.category-surface-temperature) { --category-color: var(--cat-st); }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .compare-card-marker.category-synthetic-aperture-radar) { --category-color: var(--cat-sar); }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .compare-card-marker.category-aquatic-reflectance) { --category-color: var(--cat-ar); }
        [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .compare-card-marker.category-night-time-lights) { --category-color: var(--cat-ntl); }
        .compare-header { border-bottom: 3px solid var(--category-color, var(--ceos-primary)); padding: 0 0 .65rem; margin-bottom: .4rem; }
        .compare-title { color: var(--ceos-navy); font-size: 1rem; font-weight: 760; line-height: 1.3; }
        .compare-meta { color: var(--ceos-muted); font-size: .75rem; line-height: 1.4; margin: .22rem 0 .42rem; }
        .compare-row { padding: .43rem .52rem; margin: 0; border: 0; border-radius: 6px; }
        .compare-row.row-alt { background: var(--ceos-surface-muted); }
        .compare-row.row-diff { background: #FBF5E9; box-shadow: inset 3px 0 0 #D5A950; }
        .compare-label { color: var(--ceos-muted); font-size: .69rem; line-height: 1.2; }
        .compare-value { color: var(--ceos-ink); font-size: .82rem; font-weight: 620; line-height: 1.35; overflow-wrap: anywhere; margin-top: .08rem; }
        .indicator-met { color: var(--ceos-green); }
        .indicator-outside { color: var(--ceos-amber); }
        .indicator-unknown, .indicator-info { color: #8A969E; }

        @container (max-width: 330px) {
          .product-topline { gap: .45rem; }
          .agency-mark { flex-basis: 4rem; width: 4rem; height: 2.25rem; padding: .24rem .32rem; }
          .mission-instrument { grid-template-columns: 1fr; }
          .metric-row { grid-template-columns: 1fr; }
          .mini-value { -webkit-line-clamp: 2; }
        }

        @media (max-width: 800px) {
          .block-container { width: 100%; padding-left: 1rem; padding-right: 1rem; padding-top: 3.2rem; }
          .hero { padding: .85rem .95rem .9rem 1.05rem; }
          .hero h1 { font-size: 1.45rem; }
          .page-title { font-size: 1.45rem; }
          .summary-strip { grid-template-columns: 1fr; }
          [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .profile-card-marker) { min-height: 0; }
          [data-testid="stVerticalBlock"]:has(> [data-testid="stElementContainer"] .product-card-marker) { min-height: 0; }
          [data-testid="stTabs"] [data-testid="stTab"] { padding: .62rem .7rem; }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_header() -> None:
    st.markdown(
        """
        <div class="hero">
          <div class="hero-kicker">Earth observation data discovery <span class="prototype">PROTOTYPE</span></div>
          <h1>CEOS-ARD Product Explorer</h1>
          <div class="disclaimer">This prototype supports dataset discovery, task-oriented shortlisting and comparison.
          A CEOS-ARD assessment does not certify application suitability or recommend one provider or processing approach over another.</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_page_header(eyebrow: str, title: str, description: str) -> None:
    """Render a consistent page title without creating another card surface."""
    st.markdown(
        f"""
        <div class="page-heading">
          <div class="page-eyebrow">{escape(eyebrow)}</div>
          <div class="page-title">{escape(title)}</div>
          <div class="page-description">{escape(description)}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_panel_marker(role: str) -> None:
    """Attach a semantic visual role to the current native Streamlit container."""
    safe_role = re.sub(r"[^a-z0-9-]", "", role.casefold().replace("_", "-"))
    st.markdown(f'<div class="panel-marker panel-{safe_role}"></div>', unsafe_allow_html=True)


def render_builder_panel_marker() -> None:
    """Mark repeated Profile Builder sections as a shared component type."""
    st.markdown('<div class="builder-panel-marker"></div>', unsafe_allow_html=True)


def render_stage_header(number: int, title: str, description: str) -> None:
    """Render a compact numbered workflow heading inside a native panel."""
    st.markdown(
        f"""
        <div class="stage-heading">
          <span class="stage-number">{number}</span>
          <div><div class="stage-title">{escape(title)}</div><div class="stage-description">{escape(description)}</div></div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_subsection_header(title: str, description: str = "") -> None:
    """Render a restrained form subsection title without adding layout state."""
    copy = f'<div class="subsection-copy">{escape(description)}</div>' if description else ""
    st.markdown(f'<div class="subsection-title">{escape(title)}</div>{copy}', unsafe_allow_html=True)


def render_category_cue(product_family: str) -> None:
    """Echo the active product category using the shared icon, label, and accent."""
    slug, icon, label = category_visual(None if product_family == "All product families" else product_family)
    cue = "All categories remain available" if product_family == "All product families" else "Category filter applied"
    st.markdown(
        f"""
        <div class="category-cue category-{slug}">
          <span class="category-icon" aria-hidden="true">{escape(icon)}</span>
          <span class="category-cue-copy"><strong>{escape(label)}</strong>{escape(cue)}</span>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_profile_card(profile: Profile, selected: bool, modified: bool = False) -> None:
    """Render a shallow shortcut summarising the editable defaults it applies."""
    spatial = profile.criteria.get("spatial_resolution_m", {"mode": "not_used", "value": 30})
    revisit = profile.criteria.get("revisit_days", {"mode": "not_used", "value": 30})
    spatial_mode = str(spatial.get("mode", "not_used"))
    revisit_mode = str(revisit.get("mode", "not_used"))
    spatial_value = float(spatial.get("value", 30))
    revisit_value = float(revisit.get("value", 30))
    family_summary = "All product types" if profile.default_product_family == "All product families" else profile.default_product_family or "All product types"
    spatial_summary = "Any spatial detail" if spatial_mode == "not_used" else f"{'Prefer ' if spatial_mode == 'preferred' else ''}≤{spatial_value:g} m"
    revisit_summary = "Any revisit" if revisit_mode == "not_used" else f"≤{revisit_value:g} days"
    summary = " · ".join((family_summary, spatial_summary, revisit_summary))
    status = "✓ Profile applied · Filters modified" if selected and modified else "✓ Active defaults" if selected else ""
    marker_class = "profile-card-marker is-selected" if selected else "profile-card-marker"
    st.markdown(
        f"""
        <div class="{marker_class}"></div>
        <div class="profile-card-kind">{'Built-in' if profile.built_in else 'Your profile'}</div>
        <div class="profile-card-title">{escape(profile.name)}</div>
        <div class="profile-card-description">{escape(profile.description)}</div>
        <div class="profile-card-summary">{escape(summary)}</div>
        {f'<div class="profile-card-status">{escape(status)}</div>' if status else ''}
        """,
        unsafe_allow_html=True,
    )


def render_create_profile_card() -> None:
    """Render the subdued final carousel tile that opens Profile Builder."""
    st.markdown(
        """
        <div class="profile-card-marker profile-create-marker"></div>
        <div class="profile-create-icon" aria-hidden="true">+</div>
        <div class="profile-card-kind">Your profile</div>
        <div class="profile-card-title">Create a profile</div>
        <div class="profile-card-description">Define another reusable set of filter defaults in Profile Builder.</div>
        """,
        unsafe_allow_html=True,
    )


def render_result_heading(title: str, record_count: int) -> None:
    noun = "record" if record_count == 1 else "records"
    st.markdown(
        f'<div class="result-heading"><span>{escape(title)}</span><span class="result-count">{record_count} {noun}</span></div>',
        unsafe_allow_html=True,
    )


def render_empty_state(title: str, description: str) -> None:
    st.markdown(
        f"""
        <div class="empty-state" role="status">
          <span class="empty-state-icon" aria-hidden="true">EO</span>
          <div class="empty-state-title">{escape(title)}</div>
          <div class="empty-state-copy">{escape(description)}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def display_value(value: object, suffix: str = "") -> str:
    if value is None or value == "" or value == "Unknown":
        return NOT_REPORTED
    return f"{value}{suffix}"


def display_source_type(source_type: str) -> str:
    """Return a plain-language label without changing the stored provenance value."""
    return {
        "curated_ceos_ard": "Curated CEOS-ARD record",
        "MIM API candidate": "MIM mission candidate",
        "MIM API product": "MIM API product and instrument join",
    }.get(source_type, source_type)


@lru_cache(maxsize=1)
def agency_logo_manifest() -> dict[str, dict[str, str]]:
    """Load locally vendored agency marks and their official source metadata."""
    manifest_path = AGENCY_LOGO_DIR / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return manifest.get("agencies", {})


@lru_cache(maxsize=None)
def agency_logo_data_uri(agency: str) -> str | None:
    """Return a self-contained agency-mark URI so cards never depend on live network access."""
    record = agency_logo_manifest().get(agency)
    if not record:
        return None
    path = AGENCY_LOGO_DIR / record.get("file", "")
    try:
        payload = path.read_bytes()
    except OSError:
        return None
    mime_type = record.get("mime_type", "image/png")
    return f"data:{mime_type};base64,{base64.b64encode(payload).decode('ascii')}"


def agency_mark_html(product: Product, agency: str | None) -> str:
    """Render bundled-record agency identity while keeping API records visually neutral."""
    if product.source_type.casefold().startswith("mim api"):
        return ""
    label = agency or "Agency not reported"
    if data_uri := agency_logo_data_uri(label):
        record = agency_logo_manifest().get(label, {})
        treatment = record.get("display_treatment", "")
        treatment_class = " agency-mark-monochrome-dark" if treatment == "monochrome-dark" else ""
        return (
            f'<span class="agency-mark{treatment_class}" title="{escape(label)} — identity mark, no endorsement implied">'
            f'<img src="{data_uri}" alt="{escape(label)} logo"></span>'
        )
    initials = "".join(word[0] for word in re.findall(r"[A-Za-z0-9]+", label)[:3]).upper() or "EO"
    return (
        f'<span class="agency-mark agency-mark-fallback" title="{escape(label)} — logo unavailable" '
        f'aria-label="{escape(label)}">{escape(initials)}</span>'
    )


def badge_html(product: Product) -> str:
    if product.ceos_ard_verified:
        css = "badge-verified"
        label = '<span class="badge-icon" aria-hidden="true">&#10003;</span>CEOS-ARD assessed'
    elif product.ceos_ard_status == "Assessment in progress":
        css = "badge-progress"
        label = f'<span class="badge-icon" aria-hidden="true">&#9675;</span>{escape(product.ceos_ard_status)}'
    else:
        css = "badge-neutral"
        label = f'<span class="badge-icon" aria-hidden="true">?</span>{escape(product.ceos_ard_status or "Status unknown")}'
    return f'<span class="badge {css}">{label}</span>'


def product_badges_html(product: Product) -> str:
    badges = [badge_html(product)]
    if product.pfs_version:
        badges.append(f'<span class="badge badge-version">PFS {escape(product.pfs_version)}</span>')
    if product.self_assessment_url:
        badges.append('<span class="badge badge-resource"><span class="badge-icon" aria-hidden="true">&#10003;</span>Self-assessment</span>')
    if product.peer_review_url:
        badges.append('<span class="badge badge-resource"><span class="badge-icon" aria-hidden="true">&#10003;</span>Peer review</span>')
    return "".join(badges)


def render_filter_summary(profile: Profile, product_family: str, record_count: int, source_status: str, changed: bool) -> None:
    changed_label = "Filters refined" if changed else "Profile defaults"
    values = [profile.name, product_family, f"{record_count} visible records", source_status]
    chips = "".join(f'<span class="summary-chip">{escape(value)}</span>' for value in values)
    refinement_class = " is-refined" if changed else ""
    chips += f'<span class="summary-chip{refinement_class}">{escape(changed_label)}</span>'
    st.markdown(
        f'<div class="summary-strip"><span class="summary-label">Active view</span><span class="summary-chips">{chips}</span></div>',
        unsafe_allow_html=True,
    )


def render_product_card(result: MatchResult, fedeo_match: object | None = None) -> None:
    product = result.product
    selected = st.session_state.setdefault("comparison_ids", [])
    slug, icon, category_label = category_visual(product.product_family)
    state_classes = ["product-card-marker", f"category-{slug}"]
    if product.ceos_ard_verified:
        state_classes.append("is-ceos")
    if product.id in selected:
        state_classes.append("is-selected")

    agency = product.agency or product.provider
    agency_mark = agency_mark_html(product, agency)
    mission = product.mission_name or ", ".join(product.missions) or product.family
    instrument = ", ".join(product.instruments) or product.sensor_or_instrument_type
    uses_instrument_fallback = product.spatial_resolution_m is None and product.instrument_spatial_resolution_best_m is not None
    if uses_instrument_fallback:
        resolution_label = "Finest instrument resolution*"
        resolution = display_value(product.instrument_spatial_resolution_display)
    else:
        resolution_label = "Spatial resolution"
        resolution = display_value(
            product.spatial_resolution_display or product.spatial_resolution_m,
            "" if product.spatial_resolution_display else " m",
        )
    if product.product_update_frequency_display:
        temporal_label = "Product update frequency"
        revisit = display_value(product.product_update_frequency_display)
    else:
        temporal_label = "Nominal revisit"
        revisit = display_value(product.revisit_display or product.revisit_days, "" if product.revisit_display else " days")
    bit_depth = display_value(
        product.radiometric_bit_depth_display or product.radiometric_bit_depth,
        "" if product.radiometric_bit_depth_display else "-bit",
    )
    source_label = display_source_type(product.source_type)
    instrument_resolution = ""
    if product.instrument_spatial_resolution_display:
        fallback = (
            '<span class="fallback-note">* Demo display fallback only; this instrument value is not used for product matching.</span>'
            if uses_instrument_fallback
            else ""
        )
        instrument_resolution = (
            '<div class="instrument-resolution"><strong>Finest reported instrument spatial resolution</strong> '
            f'{escape(product.instrument_spatial_resolution_display)}{fallback}</div>'
        )

    with st.container(border=True):
        st.markdown(
            f"""
            <div class="{' '.join(state_classes)}"></div>
            <div class="product-header">
              <div class="product-topline">
                <div class="category-identity category-{slug}">
                  <span class="category-icon" aria-hidden="true">{escape(icon)}</span>
                  <span>{escape(category_label)}</span>
                </div>
                {agency_mark}
              </div>
              <div class="product-title">{escape(product.product_name)}</div>
              <div class="product-agency"><span class="product-agency-label">Agency</span>{escape(display_value(agency))}</div>
              <div class="mission-instrument">
                <div class="identity-item"><span class="identity-label">Mission</span><span class="identity-value">{escape(display_value(mission))}</span></div>
                <div class="identity-item"><span class="identity-label">Instrument</span><span class="identity-value">{escape(display_value(instrument))}</span></div>
              </div>
            </div>
            <div class="badge-row">{product_badges_html(product)}</div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown(
            f"""
            <div class="metric-row">
              <div class="mini-metric" title="{escape(resolution)}"><div class="mini-label">{escape(resolution_label)}</div><div class="mini-value">{escape(resolution)}</div></div>
              <div class="mini-metric" title="{escape(revisit)}"><div class="mini-label">{escape(temporal_label)}</div><div class="mini-value">{escape(revisit)}</div></div>
              <div class="mini-metric" title="{escape(bit_depth)}"><div class="mini-label">Bit depth</div><div class="mini-value">{escape(bit_depth)}</div></div>
            </div>
            {instrument_resolution}
            <div class="criterion">{escape(result.summary)}</div>
            <div class="support-line">
              <span><span class="support-label">Coverage</span> {escape(display_value(product.geographic_coverage))}</span>
              <span><span class="support-label">Status</span> {escape(display_value(product.operational_status))}</span>
            </div>
            <div class="record-source">Record source: {escape(source_label)}</div>
            """,
            unsafe_allow_html=True,
        )

        button_label = "Selected for comparison" if product.id in selected else "Add to comparison"
        if st.button(button_label, key=f"compare_add_{product.id}", disabled=product.id in selected, use_container_width=True):
            updated, accepted = add_comparison(selected, product.id)
            if accepted:
                st.session_state.comparison_ids = updated
                st.toast("Added to comparison.")
                st.rerun()
            else:
                st.warning("You can compare up to three products. Remove one before adding another.")

        with st.expander("Technical details and manual task check"):
            details = {
                "Atmospheric correction": product.atmospheric_correction,
                "Digital elevation model": product.elevation_model,
                "Coordinate reference system": product.coordinate_system,
                "Data format": product.data_format,
                "Swath width": product.swath_width,
                "CEOS-ARD Product Family Specification": product.ceos_ard_pfs,
                "CEOS-ARD assessment level": product.ceos_ard_assessment_level,
                "Assessment details": product.ard_tier_notes,
                "Assessment approval date": product.approval_date,
                "Nominal-revisit basis": product.revisit_basis,
                "Product update frequency": product.product_update_frequency_display,
                "Spatial-resolution basis": product.spatial_resolution_basis,
                "Finest reported instrument spatial resolution": product.instrument_spatial_resolution_display,
                "Instrument spatial-resolution note": product.instrument_resolution_note,
                "Radiometric bit-depth basis": product.bit_depth_basis,
                "Reported geometric accuracy / uncertainty": product.geometric_accuracy_display,
                "Reported radiometric accuracy / uncertainty": product.radiometric_accuracy_display,
                "Reported coverage detail": product.geographic_coverage_display,
                "Record source": display_source_type(product.source_type),
            }
            for label, value in details.items():
                st.markdown(f"**{label}:** {display_value(value)}")
            if product.notes:
                st.info(product.notes)
            missing = [label for label, value in details.items() if value in (None, "", "Unknown")]
            if missing:
                st.caption("Unreported metadata: " + ", ".join(missing) + ". Complete a manual task check rather than assuming an unreported value matches a criterion.")
            links = [
                ("Official product information", product.information_url),
                ("Product access", product.access_url),
                ("CEOS-ARD self-assessment", product.self_assessment_url),
                ("CEOS peer-review outcome", product.peer_review_url),
                ("Sample data product", product.sample_product_url),
            ]
            unavailable: list[str] = []
            for label, link in links:
                if link:
                    st.link_button(f"{label} \N{NORTH EAST ARROW}", link, use_container_width=True)
                else:
                    unavailable.append(label)
            if unavailable:
                st.caption("Unavailable links: " + ", ".join(unavailable) + ".")
        render_fedeo_metadata(fedeo_match)


def render_comparison(products: list[Product], profile: Profile) -> None:
    if len(products) < 2:
        st.info("Select at least two data products in Discover to compare their reported characteristics side by side.")
        if products:
            st.caption(f"Currently selected: {products[0].product_name}")
        return
    columns = st.columns(len(products), gap="medium")
    fields = [
        ("Product name", "product_name"), ("Mission", "mission_name"), ("Product family", "product_family"),
        ("Data provider / organisation", "provider"), ("CEOS-ARD assessment status", "ceos_ard_status"),
        ("Product Family Specification (PFS)", "ceos_ard_pfs"), ("CEOS-ARD assessment level", "ceos_ard_assessment_level"),
        ("Spatial resolution", "spatial_resolution_display"),
        ("Finest reported instrument spatial resolution", "instrument_spatial_resolution_display"),
        ("Nominal revisit", "revisit_display"),
        ("Geographic coverage", "geographic_coverage"), ("Swath width", "swath_width"),
        ("Radiometric bit depth", "radiometric_bit_depth"), ("Operational status", "operational_status"),
        ("Atmospheric correction", "atmospheric_correction"), ("Digital elevation model", "elevation_model"),
        ("Coordinate reference system", "coordinate_system"), ("Data format", "data_format"), ("Record source", "source_type"),
    ]
    criterion_fields = {
        "spatial_resolution_display": "spatial_resolution_m", "revisit_display": "revisit_days",
        "radiometric_bit_depth": "radiometric_bit_depth", "geographic_coverage": "geographic_coverage",
    }
    differing_fields = {
        attribute
        for _, attribute in fields
        if len({display_value(getattr(product, attribute)) for product in products}) > 1
    }
    from matching import evaluate_product
    for column, product in zip(columns, products):
        result = evaluate_product(product, profile)
        slug, icon, category_label = category_visual(product.product_family)
        agency = product.agency or product.provider
        mission = product.mission_name or ", ".join(product.missions) or product.family
        version_badge = f'<span class="badge badge-version">PFS {escape(product.pfs_version)}</span>' if product.pfs_version else ""
        with column:
            with st.container(border=True):
                st.markdown(
                    f"""
                    <div class="compare-card-marker category-{slug}"></div>
                    <div class="compare-header">
                      <div class="category-identity category-{slug}"><span class="category-icon" aria-hidden="true">{escape(icon)}</span><span>{escape(category_label)}</span></div>
                      <div class="compare-title">{escape(product.product_name)}</div>
                      <div class="compare-meta"><strong>Agency</strong> {escape(display_value(agency))}<br><strong>Mission</strong> {escape(display_value(mission))}</div>
                      <div class="badge-row">{badge_html(product)}{version_badge}</div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
                if st.button("Remove", key=f"compare_remove_{product.id}", type="secondary", use_container_width=True):
                    st.session_state.comparison_ids = [item for item in st.session_state.comparison_ids if item != product.id]
                    st.rerun()
                for index, (label, attribute) in enumerate(fields):
                    value = getattr(product, attribute)
                    if attribute == "source_type":
                        value = display_source_type(value)
                    state = result.states.get(criterion_fields.get(attribute, ""))
                    indicator = {"met": "✓", "outside": "△", "unknown": "?"}.get(state, "•")
                    indicator_class = {"met": "indicator-met", "outside": "indicator-outside", "unknown": "indicator-unknown"}.get(state, "indicator-info")
                    if attribute == "radiometric_bit_depth" and value is not None:
                        value = f"{value}-bit"
                    row_classes = ["compare-row"]
                    if index % 2:
                        row_classes.append("row-alt")
                    if attribute in differing_fields:
                        row_classes.append("row-diff")
                    st.markdown(
                        f'<div class="{" ".join(row_classes)}"><div class="compare-label">{escape(label)}</div><div class="compare-value"><span class="{indicator_class}">{indicator}</span> {escape(display_value(value))}</div></div>',
                        unsafe_allow_html=True,
                    )
                link = product.ceos_ard_record_url or product.source_url
                if link:
                    st.link_button("Open source record", link, use_container_width=True)
    st.caption("✓ reported value matches a selected criterion · △ outside a selected profile preference or requirement · ? not reported · • informational difference")


def render_education() -> None:
    with st.expander("Understanding the selection criteria", expanded=False):
        st.markdown(
            """
            - **Spatial resolution** is a reported value in metres that helps describe spatial detail. It does not establish positional, geometric, survey-grade or cadastral accuracy.
            - **Nominal revisit** describes the expected observation opportunity for a mission or constellation. It is not a guaranteed update or delivery frequency.
            - **Actual observation availability** can also vary with cloud, acquisition strategy, access, latency and quality controls.
            - **Geographic coverage** describes the reported area or operating scope; sources may define it differently.
            - **Radiometric bit depth** describes available digital levels. Bit depth alone does not determine radiometric quality.
            - **Geometric accuracy** concerns positional agreement. Reported values are incomplete in this prototype catalogue.
            - **Radiometric accuracy** concerns measurement agreement with reference values. Reported values are incomplete here.
            - **CEOS-ARD assessment status** is shown only where explicitly mapped to a Product Family Specification. Assessment does not certify suitability for a particular application.

            Complete a manual task check for unreported metadata and any additional application requirements.
            """
        )
