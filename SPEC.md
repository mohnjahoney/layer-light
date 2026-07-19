# Layer Light — Product and Physics Specification

## Purpose

Layer Light is a small interactive web app for exploring one-dimensional heat transfer through layered window systems. A user assembles a stack such as **outside → glass → film → air gap → curtain → room**, changes material properties and environmental conditions, and sees how solar and thermal energy move through it.

The first version is an explanatory comparison tool, not a building-code or engineering calculator.

## Core interaction

- Add glass, film, curtain, air-gap, vacuum-gap, and reflective layers from a material palette.
- Reorder layers by holding their grip for half a second and dragging them into place; duplicate, select, edit, and remove layers.
- Toggle any layer off to keep it in the stack while excluding it from the optical and thermal calculation for quick with/without comparisons.
- Edit thickness, conductivity, emissivity, and shortwave transmittance/reflectance/absorptance.
- Keep the three shortwave fractions constrained to sum to one with a draggable ternary control.
- Adjust sunlight, indoor temperature, and outdoor temperature.
- Compare total room heat gain, layer/interface temperatures, effective thermal resistance, and energy destinations.

## Version-one model

- Steady-state, one-dimensional energy balance.
- Conduction through solids.
- Simplified conduction, natural convection, and linearized longwave radiation across gaps.
- Vacuum gaps remove gas conduction and convection while retaining radiation.
- Incident sunlight is separated into reflected, absorbed, and transmitted energy at each layer.
- Repeated shortwave reflections are summed analytically with coupled inward and outward fluxes; no bounce count or stopping threshold is used.
- Absorbed sunlight becomes a heat source at that layer and flows toward the room or outdoors through the thermal-resistance network.
- Directly transmitted shortwave energy is counted as room heat gain.
- Surface films represent indoor and outdoor convection.
- Energy-flow quantities are reported as fluxes in W/m². **Inward** means toward the room and **outward** means toward the outdoors.
- The physics result describes boundary, interface, and layer-interaction fluxes; a separate view-model adapter translates those physical quantities into visualization ribbons and summary categories.

The UI must expose assumptions and avoid suggesting that the result includes edge effects, coherent wave interference, spectral detail, angle of incidence, airflow around curtains, or transient thermal mass.

## Visual output

- A physical stack view with temperatures and heat-flow direction.
- A mode switcher selects the visualization without changing the underlying assembly. **Stack** shows the physical layers alone; **Steady state** shows the continuous solved fluxes; additional modes can be added without changing the solver-to-view-model boundary.
- In Steady state mode, each layer is a two-junction Sankey partition: inward and outward incident ribbons meet the layer plane, divide into transmitted, reflected, and absorbed branches, then merge into the adjacent interface fluxes. Ribbon widths are proportional to flux.
- A planned **Pulse** mode will launch a finite shortwave packet and animate successive transmission, reflection, and absorption events through the same stack. It will show a time sequence rather than the analytically summed steady-state totals.
- A compact energy-flow visualization showing reflected energy, solar energy reaching the room, heat from absorbed sunlight reaching the room, and energy rejected outdoors.
- Summary metrics for total room heat gain and effective R-value.
- Plain-language comparison cues and model notes.

## Later levels

1. Split radiation into shortwave solar and longwave thermal bands with independent material properties.
2. Add the animated radiation-pulse mode, transient heating, thermal mass, angle of incidence, and saved side-by-side scenarios.
3. Validate selected assemblies against a more complete numerical or reference model.

## Deployment

The site is built by GitHub Actions from the `main` branch and deployed as a GitHub Pages artifact. Generated `dist/` files are not committed to the repository.
