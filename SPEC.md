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
- Absorbed sunlight becomes a heat source at that layer and flows toward the room or outdoors through the thermal-resistance network.
- Directly transmitted shortwave energy is counted as room heat gain.
- Surface films represent indoor and outdoor convection.

The UI must expose assumptions and avoid suggesting that the result includes edge effects, multiple internal reflections, spectral detail, angle of incidence, airflow around curtains, or transient thermal mass.

## Visual output

- A physical stack view with temperatures and heat-flow direction.
- Shortwave energy ribbons aligned with the physical stack, branching to show reflection and absorption at each layer while the transmitted ribbon continues toward the room.
- A compact energy-flow visualization showing reflected energy, solar energy reaching the room, heat from absorbed sunlight reaching the room, and energy rejected outdoors.
- Summary metrics for total room heat gain and effective R-value.
- Plain-language comparison cues and model notes.

## Later levels

1. Split radiation into shortwave solar and longwave thermal bands with independent material properties.
2. Add transient heating, thermal mass, angle of incidence, multiple reflections, and saved side-by-side scenarios.
3. Validate selected assemblies against a more complete numerical or reference model.

## Deployment

The site is built by GitHub Actions from the `main` branch and deployed as a GitHub Pages artifact. Generated `dist/` files are not committed to the repository.
