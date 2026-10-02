import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phoneHeading } from './heading.js';

const near = (a, b) => assert.ok(Math.abs(((a - b + 540) % 360) - 180) < 0.5, `${a} ≠ ${b}`);

test('rumbo del móvil: de pie mira su trasera, tumbado su parte de arriba', () => {
  // De pie en el soporte (beta 90): alpha 0 → la trasera mira al norte; alpha 90 (girado a la izquierda) → oeste.
  near(phoneHeading(0, 90, 0), 0);
  near(phoneHeading(90, 90, 0), 270);
  near(phoneHeading(270, 90, 0), 90);
  // Algo inclinado hacia atrás en el soporte: sigue mirando al frente.
  near(phoneHeading(0, 70, 0), 0);
  // Tumbado (beta 0): manda la parte de arriba.
  near(phoneHeading(0, 0, 0), 0);
  near(phoneHeading(90, 0, 0), 270);
  // De pie sobre el canto largo con la pantalla al oeste (gamma −90): la trasera mira al este.
  near(phoneHeading(0, 0, -90), 90);
});
