import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MIN_COURSE_SPEED_METERS_PER_SECOND,
  navigationHeading,
} from "../location/navigation-heading";

test("navigation heading prefers GPS course only while moving", () => {
  assert.equal(navigationHeading(82, 3, 25), 82);
  assert.equal(
    navigationHeading(82, MIN_COURSE_SPEED_METERS_PER_SECOND, 25),
    82,
  );
  assert.equal(navigationHeading(82, 0.1, 25), 25);
  assert.equal(navigationHeading(82, null, 25), 25);
});

test("navigation heading falls back to the compass when GPS course is invalid", () => {
  assert.equal(navigationHeading(null, 3, 25), 25);
  assert.equal(navigationHeading(-1, 3, 25), 25);
  assert.equal(navigationHeading(Number.NaN, 3, 25), 25);
  assert.equal(navigationHeading(370, 3, 25), 10);
  assert.equal(navigationHeading(null, 0, null), null);
});
