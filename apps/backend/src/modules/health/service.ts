import { Effect } from "effect";

export interface HealthCheck {
  readonly status: "ok";
  readonly service: "radarpolska-backend";
  readonly checkedAt: string;
}

export function getHealth(now: () => Date = () => new Date()) {
  return Effect.succeed({
    status: "ok",
    service: "radarpolska-backend",
    checkedAt: now().toISOString(),
  } satisfies HealthCheck);
}
