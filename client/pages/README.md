# Intentionally empty

This folder holds no Next.js pages. The app lives in `../app/`.

Next.js treats a `pages/` folder as the Pages Router. VRMS already has `src/pages/`
(its React Router screens), and with `app/` at the client root Next refuses to build
unless any `pages/` folder it can see sits beside `app/`. An existing root-level
`pages/` folder makes Next ignore `src/pages/`, so the screens are not turned into
routes. Delete this folder only after `src/pages/` is renamed.
