export const MIN_COURSE_SPEED_METERS_PER_SECOND = 0.5;

function normalizeHeading(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  return value % 360;
}

export function navigationHeading(
  course: number | null,
  speed: number | null,
  compass: number | null,
): number | null {
  const normalizedCourse = normalizeHeading(course);
  const isMoving =
    speed !== null &&
    Number.isFinite(speed) &&
    speed >= MIN_COURSE_SPEED_METERS_PER_SECOND;

  if (isMoving && normalizedCourse !== null) return normalizedCourse;
  return normalizeHeading(compass);
}
