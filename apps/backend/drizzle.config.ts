import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? "postgres://radarpolska:radarpolska@127.0.0.1:5432/radarpolska",
  },
});
