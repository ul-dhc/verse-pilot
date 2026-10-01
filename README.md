# [pilot] VERSE — Vernacular Sensorium

A small, static research demonstrator for exploring sensory annotations in a pilot collection of vernacular narratives. Designed for GitHub Pages; no build process, account system or backend is required.

## Pilot collection

- 600 narratives: 150 each from Latvian, Norwegian, Finnish and Swedish collections.
- 1,228 included sensory events in 483 narratives.
- 1,174 events have mapped source coordinates; 54 do not.
- 24 English working translations, with 90 display alignments to existing source annotations.

This is an exploratory pilot. Annotations can contain errors, translations have not been human-reviewed, and coordinates can be approximate. The samples and coding schemes do not support population-level or national prevalence claims.

## Explore

The map and research graphs share filters. Select an event to open its original passage below the map. Available English translations follow the original and use matching highlight colours.

### Map

- **Sensory mix:** one dot per event, visually spread around its first source coordinate. Spokes indicate visual displacement, not travel. Other collections remain faintly visible when a collection is selected.
- **Concentration:** category-coloured heat fields with a 24-pixel smoothing radius. Colour identifies the strongest local category, brightness uses logarithmic event weighting, and the intensity slider changes visual strength. Select individual categories to inspect overlapping modes. Only the filtered selection is drawn in this view. Smoothing is a display choice, not geographic coverage or positional certainty.
- **Collections:** grouped narrative counts coloured by collection.

### Patterns of perception

- **Comparison:** shares of sensory-category links within each collection. A multimode event contributes one link to each of its categories; the denominator differs from unique event count.
- **Flow:** one gradient strand per narrative, linking annotations in original-text order. The horizontal position is the annotation offset divided by text length, not elapsed time or causation. Hover highlights a strand; select a point to read its passage.
- **Clusters:** one dot per event, grouped by sensory combination, uncertainty or collection. Spokes express visual grouping only.
- **Text density:** rank by matching events per 1,000 original-text characters (including spaces), or by raw event count. Short texts may rank highly. The compact coloured bars show sensory composition; multimode events divide their colour shares equally and still count once. Select a bar to read; click outside to clear its visual selection.

The collapsible sensory controls default to **At least one** with all seven modes selected. **Contains all** and **Exactly** provide alternative event-level matching. Deselecting every mode shows no events. **Clean filters** restores defaults; clicking **VERSE** reloads the initial view.

## Run locally

Open `index.html`, or serve this folder with a static server:

```sh
python3 -m http.server 8765
```

The bundled overview map, texts and annotations work offline. Optional OpenStreetMap tiles require an internet connection and an HTTP(S) page.

## GitHub Pages

Keep `index.html`, `app.js`, `styles.css`, `data.js`, `map-base.js`, `.nojekyll`, `leaflet.js`, `leaflet.css`, and `LEAFLET-LICENSE.txt` at the repository root. In **Settings → Pages**, select **Deploy from a branch**, branch **main**, folder **/(root)**. All asset paths are relative so project-site subpaths work.

## Source and coordinate notes

The pilot data were assembled from supplied LV/NO/FI narrative, event and metadata tables, Swedish Sagenkartan records, and the supplied translation files. Available source references and translation notes are retained in the reader.

Latvian and Norwegian coordinates come from supplied metadata. Swedish records retain supplied source locations. Finnish municipality reference points were added for Vesilahti, Lempäälä and Sääksmäki using OpenStreetMap/GeoNames via Mapcarta; Tyrisevä uses the broader Sääksmäki reference. These are approximate reference points, not exact recording or narrated-event locations. Event visualisations use only the first supplied location to avoid duplication; source information retains additional locations.

Broad bodily experience includes touch, temperature, pain, pressure, movement sensation and related codes. Original modality and uncertainty labels remain available in event details. Uncertainty schemes are not fully harmonised across collections. Absence of an uncertainty code does not demonstrate absence of uncertainty.

Original event offsets and translation alignments use Unicode code points, with exclusive end offsets. Translation alignments are display correspondences, not independent annotations. Editing a translated passage requires checking its `translationEvents` offsets and spans.

## Dependencies and rights

- [Leaflet 1.9.4](https://leafletjs.com/), bundled under BSD-2-Clause; see `LEAFLET-LICENSE.txt`.
- [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) 50m country boundaries, public domain. Generalised boundaries are not a local topographic reference.
- Optional [OpenStreetMap](https://www.openstreetmap.org/copyright) tiles are requested directly from its tile service, with attribution. They are not bundled or downloaded in bulk.

Texts and source metadata retain their respective source rights; this repository does not grant them a new licence. There is no automatic translation, tracking, persistent user account or annotation editor. Optional map tiles generate ordinary network requests to the map provider.
