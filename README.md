# Brain Survival — Parkour Game

A browser-based 3D learning survival game. Run across a floor of answer tiles, find the correct answer, and stay on it before the other tiles collapse.

## Play

Open the GitHub Pages deployment (once enabled) or serve this folder with any static web server.

For local development:

1. Clone this repository.
2. Open the folder in a terminal.
3. Run a local static server, for example: `python -m http.server 8000`.
4. Visit `http://localhost:8000`.

The game loads Three.js as an ES module from jsDelivr, so an internet connection is required.

## Controls

- **W A S D** or **arrow keys** — move
- **Space** — jump
- **Phone/tablet** — use the on-screen joystick and JUMP button

## Current prototype features

- 3D square-tile survival arena
- One human player and 15 AI competitors
- 5-second rounds
- Incorrect tiles fall away at the end of the countdown
- Survival and elimination flow
- Colour Rush, Math Madness, Animal Kingdom, Word Challenge, Shape Shifter, Memory Rush, Odd One Out, True or False, and Pattern Panic
- Random mode selection
- Responsive desktop and mobile controls

## Project structure

- `index.html` — game interface and overlays
- `styles.css` — responsive interface styling
- `game.js` — Three.js scene, player controls, AI opponents, tile challenges, and round logic

## Notes

This is the first playable foundation. NPC navigation, animation, difficulty balancing, sound, additional question banks, and more detailed character/arena art can be expanded in later iterations.
